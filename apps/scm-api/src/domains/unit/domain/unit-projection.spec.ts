import { describe, expect, it } from 'vitest';

import { projectUnit, type LifecycleFact, type ProjectionOptions } from './unit-projection.js';

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

/** 등록을 요구하지 않는 제품(또는 등록과 무관한 규칙을 보는 테스트). */
const free: ProjectionOptions = { requiresRegistration: false };
const strict: ProjectionOptions = { requiresRegistration: true };
const project = (facts: readonly LifecycleFact[], options = free) => projectUnit(facts, options);

describe('projectUnit', () => {
  it('사실이 없으면 UNKNOWN', () => {
    expect(project([])).toEqual({
      status: 'UNKNOWN',
      locationId: null,
      orderRef: null,
      registeredAt: null,
      anomalies: [],
    });
  });

  it('제조부터 배송 완료까지 정상 흐름', () => {
    const state = project([
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
      registeredAt: null,
      anomalies: [],
    });
  });

  it('개체의 이력은 제조사 출하 목록의 DISPATCHED 에서 시작해도 이상이 아니다', () => {
    const state = project([fact('DISPATCHED', 1), fact('RECEIVED', 2, { locationId: 'WH' })]);
    expect(state.status).toBe('IN_STOCK');
    expect(state.anomalies).toEqual([]);
  });

  it('입고된 재고는 거점에 있다', () => {
    const state = project([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
    ]);
    expect(state.status).toBe('IN_STOCK');
    expect(state.locationId).toBe('WH');
  });

  it('기록된 순서가 아니라 일어난 순서로 접는다', () => {
    const state = project([
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('DISPATCHED', 2),
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
    ]);
    expect(state.status).toBe('IN_STOCK');
    expect(state.anomalies).toEqual([]);
  });

  it('말이 안 되는 순서는 거부하지 않고 반영한 뒤 이상으로 표시한다', () => {
    const state = project([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('SHIPPED', 2, { orderRef: order }),
    ]);
    expect(state.status).toBe('SHIPPED');
    expect(state.anomalies).toEqual([
      '2026-01-02T00:00:00.000Z SHIPPED: PRODUCED 상태에서 올 수 없는 사실',
    ]);
  });

  it('주문 정보 없는 출고는 이상이다', () => {
    const state = project([
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
      fact('SHIPPED', 4),
    ]);
    expect(state.anomalies).toEqual(['2026-01-04T00:00:00.000Z SHIPPED: 주문 정보 없음']);
  });

  it('배송 완료는 거점을 비운다: 출고가 무효화되어 입고 뒤 배송 완료만 남아도 고객 손에 있다', () => {
    const state = project([
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
    const returned = project(base);
    expect(returned.status).toBe('DOA');
    expect(returned.locationId).toBe('SVC');
    expect(returned.orderRef).toEqual(order);

    const scrapped = project([...base, fact('SCRAPPED', 8)]);
    expect(scrapped).toEqual({
      status: 'SCRAPPED',
      locationId: null,
      orderRef: order,
      registeredAt: null,
      anomalies: [],
    });
  });

  describe('제품 등록', () => {
    const stocked = () => [
      fact('MANUFACTURED', 1, { locationId: 'FAC' }),
      fact('DISPATCHED', 2),
      fact('RECEIVED', 3, { locationId: 'WH' }),
    ];

    it('REGISTERED 는 상태·거점·이상을 바꾸지 않고 registeredAt 만 채운다', () => {
      const before = project(stocked(), strict);
      const registered = fact('REGISTERED', 4);
      const after = project([...stocked(), registered], strict);

      expect(after).toEqual({ ...before, registeredAt: registered.occurredAt });
      expect(after.status).toBe('IN_STOCK');
      expect(after.locationId).toBe('WH');
    });

    it('REGISTERED 만 있어도 UNKNOWN 상태에서 이상이 생기지 않는다', () => {
      const state = project([fact('REGISTERED', 1)], strict);
      expect(state).toEqual({
        status: 'UNKNOWN',
        locationId: null,
        orderRef: null,
        registeredAt: new Date(Date.UTC(2026, 0, 1)),
        anomalies: [],
      });
    });

    it('등록 사실이 둘이면 먼저 일어난 것이 registeredAt 이다', () => {
      const first = fact('REGISTERED', 4);
      const state = project([fact('REGISTERED', 6), first], strict);
      expect(state.registeredAt).toEqual(first.occurredAt);
    });

    it('등록 사실이 무효화되어 접는 대상에서 빠지면 registeredAt 이 비워진다', () => {
      // 유효한 사실만 접는다: 정정된 REGISTERED 는 목록에서 빠져 들어온다.
      const registered = fact('REGISTERED', 4);
      expect(project([...stocked(), registered], strict).registeredAt).not.toBeNull();
      expect(project(stocked(), strict).registeredAt).toBeNull();
    });

    it('등록 전에 출고·배송되면 미등록 개체 이상이다 (등록이 필요한 제품)', () => {
      const state = project(
        [...stocked(), fact('SHIPPED', 5, { orderRef: order }), fact('DELIVERED', 6)],
        strict,
      );
      expect(state.status).toBe('DELIVERED');
      expect(state.anomalies).toEqual([
        '2026-01-05T00:00:00.000Z SHIPPED: 미등록 개체',
        '2026-01-06T00:00:00.000Z DELIVERED: 미등록 개체',
      ]);
    });

    it('등록한 뒤 출고하면 이상이 없다', () => {
      const state = project(
        [
          ...stocked(),
          fact('REGISTERED', 4),
          fact('SHIPPED', 5, { orderRef: order }),
          fact('DELIVERED', 6),
        ],
        strict,
      );
      expect(state.anomalies).toEqual([]);
    });

    it('등록이 필요 없는 제품은 미등록이어도 이상이 아니다', () => {
      const state = project([...stocked(), fact('SHIPPED', 5, { orderRef: order })], free);
      expect(state.anomalies).toEqual([]);
    });

    it('출고 뒤에 일어난 등록은 출고 시점의 미등록을 지우지 않는다', () => {
      const state = project(
        [...stocked(), fact('SHIPPED', 5, { orderRef: order }), fact('REGISTERED', 7)],
        strict,
      );
      expect(state.anomalies).toEqual(['2026-01-05T00:00:00.000Z SHIPPED: 미등록 개체']);
      expect(state.registeredAt).toEqual(new Date(Date.UTC(2026, 0, 7)));
    });
  });
});
