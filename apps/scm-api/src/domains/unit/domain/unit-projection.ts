import type { OrderRef } from '@repo/contracts/common';
import type { PhysicalUnitEventType, UnitEventType, UnitStatus } from '@repo/contracts/scm';

export interface LifecycleFact {
  id: string;
  type: UnitEventType;
  occurredAt: Date;
  recordedAt: Date;
  locationId: string | null;
  orderRef: OrderRef | null;
}

export interface UnitState {
  status: UnitStatus;
  locationId: string | null;
  orderRef: OrderRef | null;
  /**
   * 제품으로 등록된 시각(유효한 `REGISTERED` 사실 중 가장 먼저 일어난 것). 등록되지 않았거나 그 사실이 무효화되었으면 null.
   * 물리 상태와는 별개의 축이다.
   */
  registeredAt: Date | null;
  anomalies: string[];
}

export interface ProjectionOptions {
  /** 시리얼 추적 제품이면 참. 등록 전에 출고·배송된 개체를 이상으로 표시한다. */
  requiresRegistration: boolean;
}

/**
 * 각 사실이 정상적으로 뒤따를 수 있는 상태와, 그 결과 상태.
 *
 * 개체의 이력은 처음 시리얼이 보고된 지점에서 시작한다 (docs/06-inbound-design.md "정책 변경 지점" 2).
 * 제조사 출하 목록의 `DISPATCHED` 가 첫 사실일 수 있으므로 `UNKNOWN` 에서도 정상이다.
 */
const RULES: Record<PhysicalUnitEventType, { after: readonly UnitStatus[]; becomes: UnitStatus }> =
  {
    MANUFACTURED: { after: ['UNKNOWN'], becomes: 'PRODUCED' },
    DISPATCHED: { after: ['UNKNOWN', 'PRODUCED', 'IN_STOCK'], becomes: 'IN_TRANSIT' },
    RECEIVED: { after: ['IN_TRANSIT'], becomes: 'IN_STOCK' },
    STORED: { after: ['IN_STOCK'], becomes: 'IN_STOCK' },
    SHIPPED: { after: ['IN_STOCK'], becomes: 'SHIPPED' },
    DELIVERED: { after: ['SHIPPED'], becomes: 'DELIVERED' },
    RETURN_RECEIVED: { after: ['SHIPPED', 'DELIVERED', 'DOA'], becomes: 'RETURNED' },
    DOA_CONFIRMED: { after: ['SHIPPED', 'DELIVERED', 'RETURNED'], becomes: 'DOA' },
    SCRAPPED: { after: ['DOA', 'RETURNED', 'IN_STOCK'], becomes: 'SCRAPPED' },
  };

/** 제품이 우리가 아는 거점에 놓이게 되는 사실. */
const ARRIVES: ReadonlySet<PhysicalUnitEventType> = new Set([
  'MANUFACTURED',
  'RECEIVED',
  'STORED',
  'RETURN_RECEIVED',
]);
/** 제품이 거점을 떠나는 사실. 배송 완료도 포함한다: 출고가 무효화되어도 고객 손에 있는 제품이 거점에 남지 않는다. */
const LEAVES: ReadonlySet<PhysicalUnitEventType> = new Set([
  'DISPATCHED',
  'SHIPPED',
  'DELIVERED',
  'SCRAPPED',
]);

/**
 * 유효한 사실들을 일어난 순서대로 접어 현재 상태를 만든다.
 *
 * 순서가 말이 안 되는 사실도 거부하지 않는다. 업체가 보고한 것은 그대로 받아들여
 * 상태에 반영하고, 대신 anomalies 에 남겨 사람이 정정할 수 있게 한다.
 */
export const projectUnit = (
  facts: readonly LifecycleFact[],
  options: ProjectionOptions,
): UnitState => {
  const ordered = facts.toSorted(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.recordedAt.getTime() - b.recordedAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  const state: UnitState = {
    status: 'UNKNOWN',
    locationId: null,
    orderRef: null,
    registeredAt: null,
    anomalies: [],
  };

  for (const fact of ordered) {
    // 등록은 물리 사실이 아니다. 상태 전이 표(RULES)에 없고 상태·거점·이상을 건드리지 않는다.
    if (fact.type === 'REGISTERED') {
      state.registeredAt ??= fact.occurredAt;
      continue;
    }

    const rule = RULES[fact.type];
    const at = fact.occurredAt.toISOString();
    if (!rule.after.includes(state.status)) {
      state.anomalies.push(`${at} ${fact.type}: ${state.status} 상태에서 올 수 없는 사실`);
    }

    if (ARRIVES.has(fact.type)) {
      if (fact.locationId) state.locationId = fact.locationId;
      else if (fact.type !== 'STORED') state.anomalies.push(`${at} ${fact.type}: 거점 정보 없음`);
    } else if (LEAVES.has(fact.type)) {
      state.locationId = null;
    }

    if (fact.type === 'SHIPPED') {
      state.orderRef = fact.orderRef;
      if (!fact.orderRef) state.anomalies.push(`${at} SHIPPED: 주문 정보 없음`);
    } else if (fact.type === 'RECEIVED') {
      state.orderRef = null;
    }

    // 출고·배송은 등록된 개체만 해야 한다. 자동으로 등록하지 않고 사람이 판단하게 표시만 한다.
    const leavesToCustomer = fact.type === 'SHIPPED' || fact.type === 'DELIVERED';
    if (options.requiresRegistration && leavesToCustomer && state.registeredAt === null) {
      state.anomalies.push(`${at} ${fact.type}: 미등록 개체`);
    }

    // 불량 확정품은 회수되어도 여전히 불량품이다.
    const staysDoa = fact.type === 'RETURN_RECEIVED' && state.status === 'DOA';
    state.status = staysDoa ? 'DOA' : rule.becomes;
  }

  return state;
};
