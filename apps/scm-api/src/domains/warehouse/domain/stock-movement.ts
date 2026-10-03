import type { StockMovementReason, StockStatus, TrackingMode } from '@repo/contracts/scm';

/**
 * 시리얼 없는 제품의 수량 이동. 추가만 하고 수정·삭제하지 않는다.
 * 제품·거점은 id 로만 가리킨다. 코드(sku, 거점 코드)는 catalog 도메인의 것이라 usecase 가 해석해서 넘긴다.
 */
export interface StockMovement {
  id: string;
  productId: string;
  lotNo: string | null;
  /** 한쪽 거점이 비면 입고(출발지 없음) 또는 출고·폐기(도착지 없음)다. */
  fromLocationId: string | null;
  toLocationId: string | null;
  /** 항상 양수. 방향은 출발지·도착지가 정한다. */
  quantity: number;
  stockStatus: StockStatus;
  reason: StockMovementReason;
  /** 현실에서 일어난 시각. */
  occurredAt: Date;
  /** 우리가 알게 된 시각. */
  recordedAt: Date;
  source: { system: string; ref: string | null };
  idempotencyKey: string | null;
  note: string | null;
  /** 이 이동이 되돌리는 이동. 정정(역분개)일 때만 있다. */
  reversesMovementId: string | null;
}

/** 기록할 이동. id 는 저장할 때 발급한다. */
export type NewStockMovement = Omit<StockMovement, 'id'>;

/** 거점 × 로트 × 재고 상태별 재고 한 줄 (읽기 모델). 코드는 catalog 테이블을 조인해 채운다. */
export interface StockBalance {
  sku: string;
  trackingMode: TrackingMode;
  locationCode: string;
  lotNo: string | null;
  stockStatus: StockStatus;
  /** 들어온 합 - 나간 합. 음수면 나간 기록이 들어온 기록보다 많다는 뜻이라 그대로 보여 준다. */
  quantity: number;
}

/** 이동 하나가 거점 하나의 재고를 바꾸는 양. 들어오면 양수, 나가면 음수. */
export interface LedgerEntry {
  locationId: string;
  delta: number;
}

/**
 * 이동 하나를 거점별 재고 변화로 푼다: 도착지는 +수량, 출발지는 -수량.
 * 재고 조회(`DrizzleStockMovementRepository.balances`)가 SQL 에서 같은 규칙으로 합산한다.
 */
export const ledgerEntries = (
  movement: Pick<StockMovement, 'fromLocationId' | 'toLocationId' | 'quantity'>,
): LedgerEntry[] => {
  const entries: LedgerEntry[] = [];
  if (movement.toLocationId) {
    entries.push({ locationId: movement.toLocationId, delta: movement.quantity });
  }
  if (movement.fromLocationId) {
    entries.push({ locationId: movement.fromLocationId, delta: -movement.quantity });
  }
  return entries;
};

/** 수량 원장에 기록할 수 있는 제품인가. 시리얼 제품은 개체 사실(`unit_events`)로만 추적한다. */
export const isQuantityTracked = (trackingMode: TrackingMode): boolean => trackingMode !== 'SERIAL';

export type MovementShapeProblem = 'NO_LOCATION' | 'NON_POSITIVE_QUANTITY';

/**
 * 이동이 갖춰야 할 최소 형태: 거점이 적어도 하나, 수량은 양의 정수.
 * 요청 검증(zod)과 DB 제약이 같은 말을 하므로, 여기서 걸리면 입구가 뚫린 것이다.
 */
export const movementShapeProblem = (
  movement: Pick<StockMovement, 'fromLocationId' | 'toLocationId' | 'quantity'>,
): MovementShapeProblem | undefined => {
  if (!movement.fromLocationId && !movement.toLocationId) return 'NO_LOCATION';
  if (!Number.isInteger(movement.quantity) || movement.quantity <= 0) {
    return 'NON_POSITIVE_QUANTITY';
  }
  return undefined;
};

/** 정정의 출처. 단위 사실의 정정(`logistics-hub:correction`)과 같은 규약이다. */
export const REVERSAL_SOURCE_SYSTEM = 'logistics-hub:correction';

/**
 * 이동을 되돌리는 반대 방향의 이동. 출발지와 도착지를 바꾸고 제품·로트·수량·재고 상태는 그대로 둔다.
 * 원래 이동은 건드리지 않는다. 정정한 시각이 곧 일어난 시각이고, 사유와 처리자는 메모에 남긴다.
 */
export const reversalOf = (
  original: Pick<
    StockMovement,
    'id' | 'productId' | 'lotNo' | 'fromLocationId' | 'toLocationId' | 'quantity' | 'stockStatus'
  >,
  correction: { reason: string; actor: string },
  now: Date,
): NewStockMovement => ({
  productId: original.productId,
  lotNo: original.lotNo,
  fromLocationId: original.toLocationId,
  toLocationId: original.fromLocationId,
  quantity: original.quantity,
  stockStatus: original.stockStatus,
  reason: 'ADJUSTMENT',
  occurredAt: now,
  recordedAt: now,
  source: { system: REVERSAL_SOURCE_SYSTEM, ref: correction.actor },
  idempotencyKey: null,
  note: `reversal by ${correction.actor}: ${correction.reason}`,
  reversesMovementId: original.id,
});

/** 요청 항목 하나를 어떻게 처리할지. */
export type RecordingSlot =
  /** 새로 기록한다. `order` 는 새로 기록하는 항목들 안에서의 순번. */
  | { kind: 'insert'; order: number }
  /** 같은 idempotencyKey 의 이동이 이미 저장되어 있다. */
  | { kind: 'existing'; movementId: string }
  /** 같은 요청의 앞선 항목과 idempotencyKey 가 같다. 그 항목의 결과를 따른다. */
  | { kind: 'sameAsEarlier'; index: number };

/**
 * 요청 항목들의 idempotencyKey 로 새로 기록할 것과 중복을 가른다. 키가 없는 항목은 항상 새로 기록한다.
 * @param keys 요청 순서대로의 idempotencyKey
 * @param stored 이미 저장된 키 → 이동 id
 */
export const planRecording = (
  keys: readonly (string | null)[],
  stored: ReadonlyMap<string, string>,
): RecordingSlot[] => {
  const firstIndexOfKey = new Map<string, number>();
  let inserts = 0;
  return keys.map((key, index): RecordingSlot => {
    if (key === null) return { kind: 'insert', order: inserts++ };
    const movementId = stored.get(key);
    if (movementId !== undefined) return { kind: 'existing', movementId };
    const earlier = firstIndexOfKey.get(key);
    if (earlier !== undefined) return { kind: 'sameAsEarlier', index: earlier };
    firstIndexOfKey.set(key, index);
    return { kind: 'insert', order: inserts++ };
  });
};
