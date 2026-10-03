import { Inject, Injectable } from '@nestjs/common';

import { makeEvent, Topics } from '@repo/contracts/common';
import type { DeviceRequestCreated } from '@repo/contracts/scm';
import { EventOutbox } from '@repo/nest-kit/event-outbox';

import { scmError } from '../../../errors.js';
import { computeDeviceRequestStatus } from '../domain/device-request-status.js';
import type {
  DeviceRequest,
  DeviceRequestItem,
  DeviceRequestSummary,
  ItemResultReport,
  NewDeviceRequest,
} from '../domain/device-request.js';
import { DeviceRequestRepository } from '../domain/device-request.repository.js';
import { DeviceServerGateway } from '../domain/device-server.gateway.js';

/** 모르는 시리얼 오류의 details 에 싣는 최대 개수. */
const UNKNOWN_SERIALS_SHOWN = 100;
/** 운영 화면에서 요청 하나의 실패 항목을 보여 주는 최대 개수. */
const FAILED_ITEMS_SHOWN = 1000;

export type NotifyResult = 'notified' | 'already-notified' | 'unknown-request';

/**
 * 기기 서버에 보내는 요청의 생성·알림·시리얼 목록 제공·결과 기록.
 *
 * 트랜잭션은 열지 않는다. 생성(`create`)은 usecase 의 트랜잭션 안에서 불려 요청 저장과 알림 이벤트가 함께 커밋된다.
 */
@Injectable()
export class DeviceRequestService {
  constructor(
    @Inject(DeviceRequestRepository) private readonly requests: DeviceRequestRepository,
    @Inject(DeviceServerGateway) private readonly gateway: DeviceServerGateway,
    @Inject(EventOutbox) private readonly outbox: EventOutbox,
  ) {}

  /** 요청을 저장하고, 기기 서버에 알리는 이벤트를 같은 트랜잭션으로 아웃박스에 적는다. */
  async create(draft: NewDeviceRequest): Promise<DeviceRequest> {
    const request = await this.requests.create(draft);
    await this.outbox.enqueue(
      Topics.scmDeviceRequests,
      request.id,
      makeEvent('scm.device-request.created', {
        requestId: request.id,
        type: request.type,
        count: draft.items.length,
      }) satisfies DeviceRequestCreated,
    );
    return request;
  }

  /**
   * 기기 서버에 요청이 생겼음을 알린다. 이미 알렸으면 아무것도 하지 않는다 (같은 메시지가 두 번 와도 안전).
   * 알림이 실패하면 던진다 → 메시지가 확인 처리되지 않아 다시 시도된다.
   * 알림은 느린 외부 호출이라 DB 트랜잭션 안에서 부르지 않는다. 알림 시각은 성공한 뒤에 적는다.
   */
  async notify(notification: DeviceRequestCreated['payload']): Promise<NotifyResult> {
    const request = await this.requests.findById(notification.requestId);
    if (!request) return 'unknown-request';
    if (request.notifiedAt) return 'already-notified';

    await this.gateway.notify(notification);
    await this.requests.markNotified(request.id, new Date());
    return 'notified';
  }

  async listRecent(limit: number): Promise<DeviceRequestSummary[]> {
    const rows = await this.requests.listRecent(limit);
    return rows.map(({ request, counts }) => ({
      request,
      counts,
      status: computeDeviceRequestStatus(request.notifiedAt !== null, counts),
    }));
  }

  async get(
    requestId: string,
  ): Promise<{ summary: DeviceRequestSummary; failedItems: DeviceRequestItem[] }> {
    const request = await this.findOrThrow(requestId);
    const counts = await this.requests.countsOf(requestId);
    return {
      summary: {
        request,
        counts,
        status: computeDeviceRequestStatus(request.notifiedAt !== null, counts),
      },
      failedItems: await this.requests.listFailedItems(requestId, FAILED_ITEMS_SHOWN),
    };
  }

  /** 기기 서버가 가져가는 시리얼 목록의 한 페이지. 마지막 페이지면 `nextCursor` 가 null. */
  async unitsPage(
    requestId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: DeviceRequestItem[]; nextCursor: string | null }> {
    await this.findOrThrow(requestId);
    // 한 건 더 읽어 다음 페이지가 있는지 안다.
    const rows = await this.requests.listItems(requestId, cursor, limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? last.id : null };
  }

  /**
   * 기기 서버가 보낸 시리얼별 결과를 기록한다. 같은 시리얼은 마지막 값으로 덮어쓴다.
   * 이 요청에 속하지 않는 시리얼이 하나라도 있으면 아무것도 기록하지 않고 거절한다.
   */
  async recordResults(requestId: string, reports: readonly ItemResultReport[]): Promise<void> {
    await this.findOrThrow(requestId);

    const latest = new Map(reports.map((report) => [report.serialNumber, report]));
    const known = new Set(await this.requests.findSerials(requestId, [...latest.keys()]));
    const unknown = [...latest.keys()].filter((serial) => !known.has(serial));
    if (unknown.length > 0) {
      throw scmError(
        'DEVICE_REQUEST_UNKNOWN_SERIAL',
        `${unknown.length} serial(s) do not belong to device request ${requestId}`,
        { serialNumbers: unknown.slice(0, UNKNOWN_SERIALS_SHOWN) },
      );
    }
    await this.requests.recordResults(requestId, [...latest.values()], new Date());
  }

  private async findOrThrow(requestId: string): Promise<DeviceRequest> {
    const request = await this.requests.findById(requestId);
    if (!request) {
      throw scmError('DEVICE_REQUEST_NOT_FOUND', `Device request ${requestId} not found`);
    }
    return request;
  }
}
