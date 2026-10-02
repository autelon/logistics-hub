import { describe, expect, it } from 'vitest';

import {
  orderStatusOf,
  pickItemForShipment,
  planOrder,
  sellableKindOf,
  UnknownSellableError,
  type SellableDefinition,
} from './fulfillment.js';

const sellables = new Map<string, SellableDefinition>([
  [
    'CAM',
    { code: 'CAM', name: '카메라', kind: 'SINGLE', components: [{ sku: 'CAM-01', quantity: 1 }] },
  ],
  [
    'KIT',
    {
      code: 'KIT',
      name: '스타터 키트',
      kind: 'PACKAGE',
      components: [
        { sku: 'CAM-01', quantity: 1 },
        { sku: 'BAT-01', quantity: 2 },
      ],
    },
  ],
]);

describe('sellableKindOf', () => {
  it('구성품 1종 1개만 단품이다', () => {
    expect(sellableKindOf([{ sku: 'A', quantity: 1 }])).toBe('SINGLE');
    expect(sellableKindOf([{ sku: 'A', quantity: 2 }])).toBe('PACKAGE');
    expect(
      sellableKindOf([
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 1 },
      ]),
    ).toBe('PACKAGE');
  });
});

describe('planOrder', () => {
  it('패키지를 주문 수량만큼 물리 단위로 푼다', () => {
    const [line] = planOrder([{ sellableCode: 'KIT', quantity: 2 }], sellables);
    expect(line).toMatchObject({ lineNo: 1, sellableKind: 'PACKAGE', quantity: 2 });
    expect(line?.skus).toEqual(['CAM-01', 'BAT-01', 'BAT-01', 'CAM-01', 'BAT-01', 'BAT-01']);
  });

  it('단품과 패키지가 섞인 주문은 줄 번호를 순서대로 매긴다', () => {
    const lines = planOrder(
      [
        { sellableCode: 'CAM', quantity: 1 },
        { sellableCode: 'KIT', quantity: 1 },
      ],
      sellables,
    );
    expect(lines.map((l) => [l.lineNo, l.skus.length])).toEqual([
      [1, 1],
      [2, 3],
    ]);
  });

  it('정의되지 않은 판매 상품은 전부 모아 한 번에 알린다', () => {
    const plan = () =>
      planOrder(
        [
          { sellableCode: 'X', quantity: 1 },
          { sellableCode: 'CAM', quantity: 1 },
          { sellableCode: 'Y', quantity: 1 },
          { sellableCode: 'X', quantity: 1 },
        ],
        sellables,
      );
    expect(plan).toThrow(UnknownSellableError);
    expect(plan).toThrow('Unknown sellable: X, Y');
  });
});

describe('pickItemForShipment', () => {
  const items = [
    { id: '3', sku: 'BAT-01', status: 'PENDING' },
    { id: '1', sku: 'CAM-01', status: 'SHIPPED' },
    { id: '2', sku: 'BAT-01', status: 'PENDING' },
    { id: '4', sku: 'CAM-01', status: 'PENDING' },
  ] as const;

  it('같은 SKU 의 미출고 항목 중 가장 먼저 만든 것을 고른다', () => {
    expect(pickItemForShipment(items, { sku: 'BAT-01', fulfillmentItemId: null })?.id).toBe('2');
    expect(pickItemForShipment(items, { sku: 'CAM-01', fulfillmentItemId: null })?.id).toBe('4');
  });

  it('항목 id 가 주어지면 그 항목만 대상이다', () => {
    expect(pickItemForShipment(items, { sku: 'BAT-01', fulfillmentItemId: '3' })?.id).toBe('3');
    // 이미 출고된 항목이거나 SKU 가 다르면 붙이지 않는다.
    expect(pickItemForShipment(items, { sku: 'CAM-01', fulfillmentItemId: '1' })).toBeUndefined();
    expect(pickItemForShipment(items, { sku: 'CAM-01', fulfillmentItemId: '2' })).toBeUndefined();
  });

  it('맞는 항목이 없으면 undefined', () => {
    expect(pickItemForShipment(items, { sku: 'ZZZ', fulfillmentItemId: null })).toBeUndefined();
  });
});

describe('orderStatusOf', () => {
  it('남은 항목이 모두 배송 완료여야 FULFILLED', () => {
    expect(orderStatusOf(['DELIVERED', 'DELIVERED'])).toBe('FULFILLED');
    expect(orderStatusOf(['DELIVERED', 'SHIPPED'])).toBe('OPEN');
    expect(orderStatusOf(['PENDING'])).toBe('OPEN');
  });

  it('불량·취소 항목은 제외하고 본다', () => {
    expect(orderStatusOf(['DOA', 'DELIVERED'])).toBe('FULFILLED');
    expect(orderStatusOf(['DOA', 'PENDING'])).toBe('OPEN');
    expect(orderStatusOf(['CANCELLED', 'DOA'])).toBe('OPEN');
  });
});
