import type { RegistrationExclusionReason, TrackingMode, UnitStatus } from '@repo/contracts/scm';

export interface RegistrationCandidate {
  status: UnitStatus;
  registeredAt: Date | null;
}

/**
 * 제품 등록 명령이 시리얼 하나를 등록할 수 있는지. 등록할 수 있으면 `REGISTRABLE`, 아니면 제외 사유.
 *
 * `NOT_IN_STOCK` 은 "개체 상태가 IN_STOCK 이 아님"이다. 지금은 입고(RECEIVED)된 개체를 운영자가 등록하며,
 * 적치(STORED) 확인을 요구하는 정책(`unit_receipt_trigger`, docs/06-inbound-design.md)은 입고 보고를 단계별로
 * 받는 이후 단계에서 이 함수의 조건으로 더한다.
 */
export const decideRegistration = (
  unit: RegistrationCandidate | undefined,
  trackingMode: TrackingMode,
): 'REGISTRABLE' | RegistrationExclusionReason => {
  if (!unit) return 'UNIT_NOT_FOUND';
  if (trackingMode !== 'SERIAL') return 'NOT_SERIAL_TRACKED';
  if (unit.registeredAt !== null) return 'ALREADY_REGISTERED';
  if (unit.status !== 'IN_STOCK') return 'NOT_IN_STOCK';
  return 'REGISTRABLE';
};
