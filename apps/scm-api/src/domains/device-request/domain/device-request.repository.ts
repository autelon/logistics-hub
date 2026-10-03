import type {
  DeviceRequest,
  DeviceRequestCounts,
  DeviceRequestItem,
  ItemResultReport,
  NewDeviceRequest,
} from './device-request.js';

export interface DeviceRequestRepository {
  /** 요청과 항목을 저장한다. 항목 id 는 저장할 때 발급하며 UUIDv7 이라 만든 순서대로 커서가 된다. */
  create(draft: NewDeviceRequest): Promise<DeviceRequest>;
  findById(id: string): Promise<DeviceRequest | undefined>;
  /** 아직 알림 시각이 없을 때만 적는다. */
  markNotified(id: string, at: Date): Promise<void>;

  /** 최근 요청부터. */
  listRecent(limit: number): Promise<{ request: DeviceRequest; counts: DeviceRequestCounts }[]>;
  countsOf(requestId: string): Promise<DeviceRequestCounts>;

  /** `afterItemId` 다음부터 항목 id 순서로 `limit` 건. */
  listItems(
    requestId: string,
    afterItemId: string | undefined,
    limit: number,
  ): Promise<DeviceRequestItem[]>;
  listFailedItems(requestId: string, limit: number): Promise<DeviceRequestItem[]>;
  /** 요청에 속한 시리얼만 골라 돌려준다. */
  findSerials(requestId: string, serialNumbers: readonly string[]): Promise<string[]>;
  /** 시리얼별 결과를 덮어쓴다 (마지막 값이 이긴다). */
  recordResults(requestId: string, results: readonly ItemResultReport[], at: Date): Promise<void>;
}
export const DeviceRequestRepository = Symbol('DeviceRequestRepository');
