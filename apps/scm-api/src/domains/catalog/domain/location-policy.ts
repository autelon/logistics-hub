import type { UnitReceiptTrigger } from '@repo/contracts/scm';

/**
 * 거점(파트너)의 능력 프로필. 누가 무엇을 보고하고 정하는지를 코드가 아니라 값으로 둔다.
 * 각 항목의 뜻과 쓰이는 곳은 docs/06-inbound-design.md "정책 변경 지점".
 */
export interface LocationPolicy {
  reportsSerialsOnReceipt: boolean;
  reportsSerialsOnShipment: boolean;
  reportsSerialsOnOutbound: boolean;
  reportsInspectionResult: boolean;
  decidesDisposition: boolean;
  requiresHubConfirmation: boolean;
  unitReceiptTrigger: UnitReceiptTrigger;
  autoRegisterOnPutaway: boolean;
}

/** 일부 항목만 담은 프로필. 없거나 undefined 인 항목은 "건드리지 않음"이다. */
export type LocationPolicyPatch = { [K in keyof LocationPolicy]?: LocationPolicy[K] | undefined };

/** 저장된 프로필. 변경한 사람과 시각이 딸린다. */
export interface StoredLocationPolicy extends LocationPolicy {
  locationId: string;
  updatedAt: Date;
  updatedBy: string;
}

/** 프로필 변경 이력 한 건. before·after 는 기본값이 채워진 전체 값이다. */
export interface LocationPolicyChange {
  id: string;
  locationId: string;
  actor: string;
  changedAt: Date;
  before: LocationPolicy;
  after: LocationPolicy;
}
export type NewLocationPolicyChange = Omit<LocationPolicyChange, 'id'>;

/** 오늘의 운영(사용자 확인 2026-10-03). 행이 없는 거점은 이 값으로 동작한다. */
export const DEFAULT_LOCATION_POLICY: LocationPolicy = {
  reportsSerialsOnReceipt: true,
  reportsSerialsOnShipment: true,
  reportsSerialsOnOutbound: true,
  reportsInspectionResult: false,
  decidesDisposition: false,
  requiresHubConfirmation: false,
  unitReceiptTrigger: 'PUTAWAY',
  autoRegisterOnPutaway: false,
};

/** base 위에 over 에 정의된(undefined 가 아닌) 항목만 덮어쓴다. */
const merge = (base: LocationPolicy, over: LocationPolicyPatch): LocationPolicy => ({
  reportsSerialsOnReceipt: over.reportsSerialsOnReceipt ?? base.reportsSerialsOnReceipt,
  reportsSerialsOnShipment: over.reportsSerialsOnShipment ?? base.reportsSerialsOnShipment,
  reportsSerialsOnOutbound: over.reportsSerialsOnOutbound ?? base.reportsSerialsOnOutbound,
  reportsInspectionResult: over.reportsInspectionResult ?? base.reportsInspectionResult,
  decidesDisposition: over.decidesDisposition ?? base.decidesDisposition,
  requiresHubConfirmation: over.requiresHubConfirmation ?? base.requiresHubConfirmation,
  unitReceiptTrigger: over.unitReceiptTrigger ?? base.unitReceiptTrigger,
  autoRegisterOnPutaway: over.autoRegisterOnPutaway ?? base.autoRegisterOnPutaway,
});

/**
 * 거점의 유효한 프로필. 행이 없으면 기본값, 일부만 있으면 나머지를 기본값으로 채운다.
 * 저장 행의 부가 컬럼(locationId, updatedBy 등)은 결과에 담지 않는다.
 */
export const resolvePolicy = (stored: LocationPolicyPatch | undefined): LocationPolicy =>
  merge(DEFAULT_LOCATION_POLICY, stored ?? {});

/** 보낸 항목만 바꾼다. 정의되지 않은 항목은 현재 값을 유지한다. */
export const applyPolicyPatch = (
  current: LocationPolicy,
  patch: LocationPolicyPatch,
): LocationPolicy => merge(current, patch);

export const isSamePolicy = (a: LocationPolicy, b: LocationPolicy): boolean =>
  a.reportsSerialsOnReceipt === b.reportsSerialsOnReceipt &&
  a.reportsSerialsOnShipment === b.reportsSerialsOnShipment &&
  a.reportsSerialsOnOutbound === b.reportsSerialsOnOutbound &&
  a.reportsInspectionResult === b.reportsInspectionResult &&
  a.decidesDisposition === b.decidesDisposition &&
  a.requiresHubConfirmation === b.requiresHubConfirmation &&
  a.unitReceiptTrigger === b.unitReceiptTrigger &&
  a.autoRegisterOnPutaway === b.autoRegisterOnPutaway;
