import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { DeviceRequestNotification } from '@repo/contracts/scm';

import { HubClient } from './hub.client.js';
import { mockDeviceConfig } from './mock-device.config.js';
import { simulateResult } from './simulate-result.js';

export interface DeviceRequestState extends DeviceRequestNotification {
  /** PULLING: 시리얼을 가져가며 처리 중, DONE: 끝, ERROR: 허브와 통신 실패로 멈춤 (같은 알림이 다시 오면 다시 처리). */
  state: 'PULLING' | 'DONE' | 'ERROR';
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * 모의 기기 서버의 처리. 알림을 받으면 요청을 기억하고, 비동기로 시리얼 목록을 페이지로 전부 가져와
 * 로그를 남기고 결과를 돌려준다. 같은 requestId 알림이 다시 와도 한 번만 처리한다 (연동 계약의 멱등).
 */
@Injectable()
export class DeviceRequestsService {
  private readonly logger = new Logger(DeviceRequestsService.name);
  private readonly requests = new Map<string, DeviceRequestState>();

  constructor(
    private readonly hub: HubClient,
    @Inject(mockDeviceConfig.KEY) private readonly config: ConfigType<typeof mockDeviceConfig>,
  ) {}

  /** `accepted`: 처리를 시작했다. `duplicate`: 이미 받은 requestId 라 아무것도 하지 않는다. */
  accept(notification: DeviceRequestNotification): 'accepted' | 'duplicate' {
    const existing = this.requests.get(notification.requestId);
    if (existing && existing.state !== 'ERROR') return 'duplicate';

    const state: DeviceRequestState = {
      ...notification,
      state: 'PULLING',
      processed: 0,
      succeeded: 0,
      failed: 0,
    };
    this.requests.set(notification.requestId, state);
    this.logger.log(
      `Received ${notification.type} request ${notification.requestId} (${notification.count} units)`,
    );
    // 알림에는 바로 응답하고 시리얼은 뒤에서 가져간다. 실패는 상태에 남기고 로그로 알린다.
    void this.process(state).catch((error: unknown) => {
      state.state = 'ERROR';
      this.logger.error(
        `Request ${state.requestId} stopped after ${state.processed} units: ${String(error)}`,
      );
    });
    return 'accepted';
  }

  list(): DeviceRequestState[] {
    return [...this.requests.values()];
  }

  private async process(state: DeviceRequestState): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await this.hub.units(state.requestId, cursor);
      const items = page.items.map(({ serialNumber, sku }) => {
        const outcome = simulateResult(serialNumber, this.config.failSerialSuffix);
        const verb = state.type === 'REGISTER' ? 'register' : 'deactivate';
        this.logger.log(
          `${verb} ${serialNumber} (${sku}) -> ${outcome.result} [${state.requestId}]`,
        );
        return { serialNumber, ...outcome };
      });

      if (items.length > 0) await this.hub.report(state.requestId, { items });
      state.processed += items.length;
      state.failed += items.filter((item) => item.result === 'FAILED').length;
      state.succeeded = state.processed - state.failed;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    state.state = 'DONE';
    this.logger.log(
      `Finished request ${state.requestId}: ${state.succeeded} succeeded, ${state.failed} failed`,
    );
  }
}
