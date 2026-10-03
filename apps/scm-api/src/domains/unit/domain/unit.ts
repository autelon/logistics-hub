import type { OrderRef } from '@repo/contracts/common';
import type { UnitEventType, UnitStatus } from '@repo/contracts/scm';

/**
 * 물리 제품 한 개. status 이하는 사실(UnitEvent)들을 `projectUnit` 으로 접어 만든 "현재 상태" 캐시이며
 * 원본이 아니다. 제품·거점은 id 로만 가리킨다. 코드(sku, 거점 코드)는 catalog 도메인의 것이라
 * usecase 가 해석해서 넘긴다 (`ProductRef`, `LocationRef`).
 */
export interface Unit {
  id: string;
  serialNumber: string;
  productId: string;
  status: UnitStatus;
  locationId: string | null;
  orderRef: OrderRef | null;
  anomalies: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** 물리 제품에 일어난 사실. 추가만 하고 수정·삭제하지 않는다. */
export interface UnitEvent {
  id: string;
  unitId: string;
  type: UnitEventType;
  /** 현실에서 일어난 시각. */
  occurredAt: Date;
  /** 우리가 알게 된 시각. */
  recordedAt: Date;
  locationId: string | null;
  orderRef: OrderRef | null;
  caseId: string | null;
  source: { system: string; ref: string | null };
  idempotencyKey: string | null;
  note: string | null;
}

/** 정정 기록. target 사실은 무효가 되고, replacement 가 있으면 그것이 대신 유효해진다. */
export interface UnitEventCorrection {
  id: string;
  targetEventId: string;
  replacementEventId: string | null;
  reason: string;
  actor: string;
  recordedAt: Date;
}

/** catalog 도메인에서 해석해 넘겨받는 참조. unit 도메인은 코드의 존재를 검증하지 않는다. */
export interface ProductRef {
  id: string;
  sku: string;
}
export interface LocationRef {
  id: string;
  code: string;
}

/** 기록할 사실. id 와 recordedAt 은 저장할 때 정해진다. */
export interface NewUnitEvent {
  type: UnitEventType;
  occurredAt: Date;
  location: LocationRef | null;
  orderRef: OrderRef | null;
  caseId: string | null;
  source: { system: string; ref: string | null };
  idempotencyKey: string | null;
  note: string | null;
}

// ---------- 읽기 모델 (코드는 catalog 테이블을 조인해 채운다) ----------

export interface UnitLifecycle {
  unit: Unit;
  sku: string;
  locationCode: string | null;
  /** 정정으로 무효화된 사실도 정정 내역과 함께 포함한다. */
  events: {
    event: UnitEvent;
    locationCode: string | null;
    correction: UnitEventCorrection | null;
  }[];
}

/** SKU × 거점 × 상태별 수량. */
export interface StockCount {
  sku: string;
  locationCode: string | null;
  status: UnitStatus;
  quantity: number;
}
