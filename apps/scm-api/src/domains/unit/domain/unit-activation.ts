import type { DeviceRequestType, UnitEventType, UnitStatus } from '@repo/contracts/scm';

/** 활성 여부를 정하는 것만 모은 모양. `Unit` 과 `UnitState` 가 모두 들어맞는다. */
export interface ActivationInput {
  status: UnitStatus;
  registeredAt: Date | null;
}

/** 기기 서버에서 활성 상태여야 하는가: 등록되었고, 불량(DOA)이나 폐기가 아니다. */
export const shouldBeActive = ({ status, registeredAt }: ActivationInput): boolean =>
  registeredAt !== null && status !== 'DOA' && status !== 'SCRAPPED';

/**
 * 제품 상태가 바뀐 결과 기기 서버에 보내야 하는 요청. 활성 여부가 그대로면 null.
 * 활성 → 비활성은 `DEACTIVATE`, 비활성 → 활성은 `REGISTER`.
 * 사실을 다시 접는 모든 usecase 가 접기 전후를 이 함수로 비교한다.
 */
export const activationChange = (
  before: ActivationInput,
  after: ActivationInput,
): DeviceRequestType | null => {
  const was = shouldBeActive(before);
  const now = shouldBeActive(after);
  if (was === now) return null;
  return now ? 'REGISTER' : 'DEACTIVATE';
};

/**
 * 정정이 만든 기기 요청의 사유.
 * - 비활성화: 등록 사실을 무효화했으면 `REGISTRATION_VOIDED`, 아니면 비활성화를 일으킨 사실의 종류
 *   (대체 사실이 있으면 그것, 없으면 무효화한 사실).
 * - 다시 등록: 무효화한 사실이 원인이었으므로 `<무효화한 사실>_VOIDED` (예: `DOA_CONFIRMED_VOIDED`).
 */
export const correctionDeviceRequestReason = (
  type: DeviceRequestType,
  voided: UnitEventType,
  replacement: UnitEventType | undefined,
): string => {
  if (type === 'REGISTER') return `${voided}_VOIDED`;
  return voided === 'REGISTERED' ? 'REGISTRATION_VOIDED' : (replacement ?? voided);
};
