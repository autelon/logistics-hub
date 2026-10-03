import type { DeviceRequestNotification } from '@repo/contracts/scm';

/**
 * 기기 서버(기기 활성화 등을 처리하는 별도 API 서버)에 요청이 생겼음을 알리는 포트.
 * 시리얼 목록은 보내지 않는다. 기기 서버가 `GET /device-requests/:id/units` 로 당겨 간다.
 */
export interface DeviceServerGateway {
  /** 실패하면(네트워크 오류, 2xx 가 아닌 응답) 던진다. 호출한 쪽이 다시 시도한다. */
  notify(notification: DeviceRequestNotification): Promise<void>;
}
export const DeviceServerGateway = Symbol('DeviceServerGateway');
