import type { DeviceRequestStatus } from '@repo/contracts/scm';

import type { DeviceRequestCounts } from './device-request.js';

/**
 * 요청의 상태는 저장하지 않고 알림 여부와 항목별 결과에서 계산한다.
 * NOT_NOTIFIED → NOTIFIED(결과 없음) → IN_PROGRESS → COMPLETED | PARTIALLY_FAILED.
 *
 * 결과가 하나라도 있으면 알림 여부와 상관없이 결과를 따른다: 기기 서버는 알림 응답을 돌려주기 전에
 * 시리얼을 가져가 결과를 보낼 수 있고, 그러면 우리가 `notified_at` 을 적기 전에 결과가 먼저 도착한다.
 */
export const computeDeviceRequestStatus = (
  notified: boolean,
  counts: DeviceRequestCounts,
): DeviceRequestStatus => {
  const reported = counts.succeeded + counts.failed;
  if (reported === 0) return notified ? 'NOTIFIED' : 'NOT_NOTIFIED';
  if (reported < counts.total) return 'IN_PROGRESS';
  return counts.failed > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED';
};
