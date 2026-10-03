import { describe, expect, it } from 'vitest';

import {
  isQuantityTracked,
  ledgerEntries,
  movementShapeProblem,
  planRecording,
  reversalOf,
} from './stock-movement.js';

describe('ledgerEntries', () => {
  it('도착지는 들어오고(+) 출발지는 나간다(-)', () => {
    expect(ledgerEntries({ fromLocationId: 'A', toLocationId: 'B', quantity: 5 })).toEqual([
      { locationId: 'B', delta: 5 },
      { locationId: 'A', delta: -5 },
    ]);
  });

  it('출발지가 없으면 입고, 도착지가 없으면 출고·폐기다', () => {
    expect(ledgerEntries({ fromLocationId: null, toLocationId: 'B', quantity: 3 })).toEqual([
      { locationId: 'B', delta: 3 },
    ]);
    expect(ledgerEntries({ fromLocationId: 'A', toLocationId: null, quantity: 3 })).toEqual([
      { locationId: 'A', delta: -3 },
    ]);
  });

  it('이동과 그 역분개의 합은 거점마다 0 이다', () => {
    const original = { fromLocationId: 'A', toLocationId: 'B', quantity: 7 };
    const reversal = reversalOf(
      { id: 'm1', productId: 'p', lotNo: null, stockStatus: 'AVAILABLE', ...original },
      { reason: 'x', actor: 'y' },
      new Date(),
    );
    const net = new Map<string, number>();
    for (const { locationId, delta } of [...ledgerEntries(original), ...ledgerEntries(reversal)]) {
      net.set(locationId, (net.get(locationId) ?? 0) + delta);
    }
    expect([...net.values()]).toEqual([0, 0]);
  });
});

describe('isQuantityTracked', () => {
  it('시리얼 제품만 수량 원장에 기록할 수 없다', () => {
    expect(isQuantityTracked('SERIAL')).toBe(false);
    expect(isQuantityTracked('LOT')).toBe(true);
    expect(isQuantityTracked('NONE')).toBe(true);
  });
});

describe('movementShapeProblem', () => {
  it('거점이 하나도 없으면 NO_LOCATION', () => {
    expect(movementShapeProblem({ fromLocationId: null, toLocationId: null, quantity: 1 })).toBe(
      'NO_LOCATION',
    );
  });

  it('수량이 양의 정수가 아니면 NON_POSITIVE_QUANTITY', () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(movementShapeProblem({ fromLocationId: 'A', toLocationId: null, quantity })).toBe(
        'NON_POSITIVE_QUANTITY',
      );
    }
  });

  it('갖춰졌으면 undefined', () => {
    expect(
      movementShapeProblem({ fromLocationId: null, toLocationId: 'B', quantity: 1 }),
    ).toBeUndefined();
  });
});

describe('reversalOf', () => {
  const original = {
    id: 'm1',
    productId: 'p1',
    lotNo: 'LOT-1',
    fromLocationId: 'A',
    toLocationId: 'B',
    quantity: 4,
    stockStatus: 'QC' as const,
  };
  const now = new Date('2026-10-04T00:00:00Z');

  it('출발지와 도착지를 바꾸고 나머지는 그대로 둔다', () => {
    const reversal = reversalOf(original, { reason: '잘못 입력', actor: 'op-1' }, now);
    expect(reversal).toMatchObject({
      productId: 'p1',
      lotNo: 'LOT-1',
      fromLocationId: 'B',
      toLocationId: 'A',
      quantity: 4,
      stockStatus: 'QC',
      reason: 'ADJUSTMENT',
      reversesMovementId: 'm1',
      idempotencyKey: null,
      occurredAt: now,
      recordedAt: now,
    });
  });

  it('입고의 역분개는 출고가 되고, 사유와 처리자를 메모와 출처에 남긴다', () => {
    const reversal = reversalOf(
      { ...original, fromLocationId: null },
      { reason: '이중 입력', actor: 'op-1' },
      now,
    );
    expect(reversal.fromLocationId).toBe('B');
    expect(reversal.toLocationId).toBeNull();
    expect(reversal.source).toEqual({ system: 'logistics-hub:correction', ref: 'op-1' });
    expect(reversal.note).toBe('reversal by op-1: 이중 입력');
  });
});

describe('planRecording', () => {
  it('키가 없는 항목은 항상 새로 기록한다', () => {
    expect(planRecording([null, null], new Map())).toEqual([
      { kind: 'insert', order: 0 },
      { kind: 'insert', order: 1 },
    ]);
  });

  it('이미 저장된 키는 기존 이동을 가리키고 순번을 소비하지 않는다', () => {
    expect(planRecording(['a', 'b', null], new Map([['a', 'm-a']]))).toEqual([
      { kind: 'existing', movementId: 'm-a' },
      { kind: 'insert', order: 0 },
      { kind: 'insert', order: 1 },
    ]);
  });

  it('한 요청 안에서 키가 겹치면 뒤 항목은 앞 항목을 따른다', () => {
    expect(planRecording(['k', 'k', 'k'], new Map())).toEqual([
      { kind: 'insert', order: 0 },
      { kind: 'sameAsEarlier', index: 0 },
      { kind: 'sameAsEarlier', index: 0 },
    ]);
  });
});
