import { describe, expect, it } from 'vitest';

import { projectUnit, type LifecycleFact } from './unit-projection.js';

let seq = 0;
const fact = (
  type: LifecycleFact['type'],
  day: number,
  extra: Partial<LifecycleFact> = {},
): LifecycleFact => {
  const at = new Date(Date.UTC(2026, 0, day));
  return {
    id: String(++seq).padStart(4, '0'),
    type,
    occurredAt: at,
    recordedAt: at,
    locationId: null,
    orderRef: null,
    ...extra,
  };
};
const order = { orderId: 'O-1', fulfillmentItemId: 'F-1' };

describe('projectUnit', () => {
  it('사실이 없으면 UNKNOWN', () => {
    expect(projectUnit([])).toEqual({
      status: 'UNKNOWN',
      locationId: null,
      orderRef: null,
      anomalies: [],
    });
  });

  it('제조부터 배송 완료까지 정상 흐름', () => {
    const state = projectUnit([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('STORED', 3, { locationId: 'WH' }),
      fact('SHIPPED', 5, { orderRef: order }),
      fact('DELIVERED', 6),
    ]);
    expect(state).toEqual({
      status: 'DELIVERED',
      locationId: null,
      orderRef: order,
      anomalies: [],
    });
  });

  it('입고된 재고는 거점에 있다', () => {
    const state = projectUnit([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
    ]);
    expect(state.status).toBe('IN_STOCK');
    expect(state.locationId).toBe('WH');
  });

  it('기록된 순서가 아니라 일어난 순서로 접는다', () => {
    const state = projectUnit([
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('DISPATCHED', 2),
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
    ]);
    expect(state.status).toBe('IN_STOCK');
    expect(state.anomalies).toEqual([]);
  });

  it('말이 안 되는 순서는 거부하지 않고 반영한 뒤 이상으로 표시한다', () => {
    const state = projectUnit([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('SHIPPED', 2, { orderRef: order }),
    ]);
    expect(state.status).toBe('SHIPPED');
    expect(state.anomalies).toEqual([
      '2026-01-02T00:00:00.000Z SHIPPED: PRODUCED 상태에서 올 수 없는 사실',
    ]);
  });

  it('주문 정보 없는 출고는 이상이다', () => {
    const state = projectUnit([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('SHIPPED', 4),
    ]);
    expect(state.anomalies).toEqual(['2026-01-04T00:00:00.000Z SHIPPED: 주문 정보 없음']);
  });

  it('배송 완료는 거점을 비운다: 출고가 무효화되어 입고 뒤 배송 완료만 남아도 고객 손에 있다', () => {
    const state = projectUnit([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('DELIVERED', 4),
    ]);
    expect(state.status).toBe('DELIVERED');
    expect(state.locationId).toBeNull();
    expect(state.anomalies).toEqual([
      '2026-01-04T00:00:00.000Z DELIVERED: IN_STOCK 상태에서 올 수 없는 사실',
    ]);
  });

  it('DOA 확정 → 회수 → 폐기: 회수되어도 불량 상태를 유지하고 폐기로 끝난다', () => {
    const base = [
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('SHIPPED', 4, { orderRef: order }),
      fact('DELIVERED', 5),
      fact('DOA_CONFIRMED', 6),
      fact('RETURN_RECEIVED', 7, { locationId: 'SVC' }),
    ];
    const returned = projectUnit(base);
    expect(returned.status).toBe('DOA');
    expect(returned.locationId).toBe('SVC');
    expect(returned.orderRef).toEqual(order);

    const scrapped = projectUnit([...base, fact('SCRAPPED', 8)]);
    expect(scrapped).toEqual({
      status: 'SCRAPPED',
      locationId: null,
      orderRef: order,
      anomalies: [],
    });
  });
});
