import { describe, expect, it } from 'vitest';

import {
  matchToOrder,
  pickOrderLine,
  planLink,
  planShipment,
  type OrderedLine,
  type PlanContext,
  type PlanLine,
  type PlanningOrder,
} from './shipment-plan.js';

const orderLine = (overrides: Partial<OrderedLine> & Pick<OrderedLine, 'id' | 'lineNo'>) => ({
  productId: 'P1',
  orderedQty: 10,
  overTolerancePct: null,
  closed: false,
  cancelled: false,
  ...overrides,
});

const order = (...lines: OrderedLine[]): PlanningOrder => ({ poNumber: 'PO-1', lines });

const line = (overrides: Partial<PlanLine> = {}): PlanLine => ({
  lineNo: 1,
  sku: 'CAM-01',
  productId: 'P1',
  trackingMode: 'SERIAL',
  quantity: 2,
  serialNumbers: ['S1', 'S2'],
  ...overrides,
});

const ordered = (target: PlanningOrder, shipped: [string, number][] = []): PlanContext => ({
  target: { kind: 'ORDER', order: target, shipped: new Map(shipped) },
  knownSerials: new Set(),
  unitProducts: new Map(),
});

const codes = (anomalies: { code: string }[]) => anomalies.map((a) => a.code);

describe('pickOrderLine', () => {
  it('같은 제품의 줄이 없으면 고르지 않는다', () => {
    const lines = [orderLine({ id: 'A', lineNo: 1, productId: 'OTHER' })];
    expect(pickOrderLine(lines, 'P1', new Map())).toBeUndefined();
  });

  it('남은 수량이 있는 줄 가운데 줄 번호가 가장 작은 것을 고른다', () => {
    const lines = [
      orderLine({ id: 'C', lineNo: 3 }),
      orderLine({ id: 'A', lineNo: 1, orderedQty: 5 }),
      orderLine({ id: 'B', lineNo: 2 }),
    ];
    expect(pickOrderLine(lines, 'P1', new Map())?.id).toBe('A');
    // 줄 1 이 이미 다 선적됐으면 줄 2.
    expect(pickOrderLine(lines, 'P1', new Map([['A', 5]]))?.id).toBe('B');
  });

  it('남은 수량이 있는 줄이 없으면 열린 줄 중 가장 작은 줄 번호(넘치면 이상으로 표시된다)', () => {
    const lines = [orderLine({ id: 'A', lineNo: 1 }), orderLine({ id: 'B', lineNo: 2 })];
    expect(
      pickOrderLine(
        lines,
        'P1',
        new Map([
          ['A', 10],
          ['B', 10],
        ]),
      )?.id,
    ).toBe('A');
  });

  it('열린 줄이 없으면 닫힌 줄, 그것도 없으면 취소한 줄을 고른다', () => {
    const closed = orderLine({ id: 'A', lineNo: 2, closed: true });
    const cancelled = orderLine({ id: 'B', lineNo: 1, cancelled: true });
    expect(pickOrderLine([cancelled, closed], 'P1', new Map())?.id).toBe('A');
    expect(pickOrderLine([cancelled], 'P1', new Map())?.id).toBe('B');
  });
});

describe('matchToOrder', () => {
  it('앞 줄이 더한 수량이 뒤 줄이 볼 선적 누계에 들어간다', () => {
    const target = order(
      orderLine({ id: 'A', lineNo: 1, orderedQty: 5 }),
      orderLine({ id: 'B', lineNo: 2, orderedQty: 5 }),
    );
    const result = matchToOrder(
      [
        { lineNo: 1, sku: 'CAM-01', productId: 'P1', quantity: 5 },
        { lineNo: 2, sku: 'CAM-01', productId: 'P1', quantity: 3 },
      ],
      target,
      new Map(),
    );
    expect(result.matches.map((m) => m?.id)).toEqual(['A', 'B']);
    expect(result.added).toEqual(
      new Map([
        ['A', 5],
        ['B', 3],
      ]),
    );
    expect(result.anomalies).toEqual([]);
  });

  it('발주에 없는 제품은 PO_LINE_UNMATCHED', () => {
    const result = matchToOrder(
      [{ lineNo: 1, sku: 'NOPE', productId: 'P9', quantity: 1 }],
      order(orderLine({ id: 'A', lineNo: 1 })),
      new Map(),
    );
    expect(result.matches).toEqual([undefined]);
    expect(result.anomalies).toEqual([
      { code: 'PO_LINE_UNMATCHED', message: expect.stringContaining('NOPE'), lineNo: 1 },
    ]);
  });
});

describe('planShipment', () => {
  it('이상 없는 선적: 발주 줄에 맞고 시리얼은 모두 기록 대상', () => {
    const plan = planShipment([line()], ordered(order(orderLine({ id: 'A', lineNo: 1 }))));
    expect(plan.linked).toBe(true);
    expect(plan.anomalies).toEqual([]);
    expect(plan.lines).toEqual([
      { purchaseOrderLineId: 'A', serialNumbers: ['S1', 'S2'], recordableSerials: ['S1', 'S2'] },
    ]);
    expect(plan.shippedDelta).toEqual(new Map([['A', 2]]));
  });

  it('발주를 못 찾으면 PO_UNLINKED 하나이고 줄마다 PO_LINE_UNMATCHED 를 내지 않는다', () => {
    const plan = planShipment([line()], {
      target: { kind: 'UNLINKED', reason: '모르는 발주 번호 PO-X' },
      knownSerials: new Set(),
      unitProducts: new Map(),
    });
    expect(plan.linked).toBe(false);
    expect(plan.anomalies).toEqual([
      { code: 'PO_UNLINKED', message: '모르는 발주 번호 PO-X', lineNo: null },
    ]);
    expect(plan.lines[0]?.purchaseOrderLineId).toBeNull();
    // 시리얼은 발주에 연결되지 않아도 개체의 이력으로 이어진다.
    expect(plan.lines[0]?.recordableSerials).toEqual(['S1', 'S2']);
    expect(plan.shippedDelta.size).toBe(0);
  });

  it('시리얼 수가 수량과 다르면 SERIAL_COUNT_MISMATCH, 목록이 없으면 그렇게 말한다', () => {
    const target = order(orderLine({ id: 'A', lineNo: 1 }));
    const fewer = planShipment([line({ quantity: 3 })], ordered(target));
    expect(fewer.anomalies).toEqual([
      { code: 'SERIAL_COUNT_MISMATCH', message: 'CAM-01 시리얼 2개, 수량 3', lineNo: 1 },
    ]);
    // 개수가 안 맞아도 보고된 시리얼은 이력을 남긴다.
    expect(fewer.lines[0]?.recordableSerials).toEqual(['S1', 'S2']);

    const none = planShipment([line({ serialNumbers: [] })], ordered(target));
    expect(none.anomalies).toEqual([
      { code: 'SERIAL_COUNT_MISMATCH', message: 'CAM-01 시리얼 목록이 없음 (수량 2)', lineNo: 1 },
    ]);
  });

  it('시리얼 추적이 아닌 제품에 시리얼이 오면 SERIALS_ON_UNTRACKED_PRODUCT 이고 개체를 만들지 않는다', () => {
    const plan = planShipment(
      [line({ sku: 'LENS-01', trackingMode: 'NONE', quantity: 5, serialNumbers: ['L1'] })],
      ordered(order(orderLine({ id: 'A', lineNo: 1 }))),
    );
    expect(codes(plan.anomalies)).toEqual(['SERIALS_ON_UNTRACKED_PRODUCT']);
    expect(plan.lines[0]?.recordableSerials).toEqual([]);
    // 시리얼 추적이 아니면 수량과 시리얼 수가 달라도 개수 이상은 없다.
    expect(codes(plan.anomalies)).not.toContain('SERIAL_COUNT_MISMATCH');
  });

  it('선적 누계가 주문 수량 + 과납 허용을 넘으면 OVER_SHIPPED, 허용 안이면 아니다', () => {
    const tolerant = order(orderLine({ id: 'A', lineNo: 1, orderedQty: 100, overTolerancePct: 5 }));
    const inside = planShipment(
      [line({ quantity: 5, serialNumbers: [] })],
      ordered(tolerant, [['A', 100]]),
    );
    expect(codes(inside.anomalies)).not.toContain('OVER_SHIPPED');

    const over = planShipment(
      [line({ quantity: 6, serialNumbers: [] })],
      ordered(tolerant, [['A', 100]]),
    );
    expect(over.anomalies.find((a) => a.code === 'OVER_SHIPPED')).toMatchObject({ lineNo: 1 });
  });

  it('닫힌 줄·취소한 줄로 가면 PO_LINE_CLOSED·PO_LINE_CANCELLED', () => {
    const closed = planShipment(
      [line({ serialNumbers: [] })],
      ordered(order(orderLine({ id: 'A', lineNo: 1, closed: true }))),
    );
    expect(codes(closed.anomalies)).toContain('PO_LINE_CLOSED');

    const cancelled = planShipment(
      [line({ serialNumbers: [] })],
      ordered(order(orderLine({ id: 'A', lineNo: 1, cancelled: true }))),
    );
    expect(codes(cancelled.anomalies)).toContain('PO_LINE_CANCELLED');
    // 취소한 줄에는 과납 이상을 겹쳐 내지 않는다.
    expect(codes(cancelled.anomalies)).not.toContain('OVER_SHIPPED');
  });

  it('다른 선적에 이미 있는 시리얼과 같은 선적 안의 중복은 DUPLICATE_SERIAL, 첫 줄만 기록 대상', () => {
    const target = order(orderLine({ id: 'A', lineNo: 1, orderedQty: 99 }));
    const plan = planShipment(
      [
        line({ lineNo: 1, quantity: 3, serialNumbers: ['S1', 'S1', 'S2'] }),
        line({ lineNo: 2, quantity: 1, serialNumbers: ['S2'] }),
      ],
      { ...ordered(target), knownSerials: new Set(['S1']) },
    );
    expect(plan.lines[0]?.serialNumbers).toEqual(['S1', 'S2']);
    expect(plan.lines[1]?.recordableSerials).toEqual([]);
    const duplicates = plan.anomalies.filter((a) => a.code === 'DUPLICATE_SERIAL');
    expect(duplicates).toEqual([
      { code: 'DUPLICATE_SERIAL', message: expect.stringContaining('같은 줄 1건'), lineNo: 1 },
      {
        code: 'DUPLICATE_SERIAL',
        message: '다른 선적에 이미 있는 시리얼: S1',
        lineNo: 1,
      },
      {
        code: 'DUPLICATE_SERIAL',
        message: expect.stringContaining('앞 줄과 겹침 S2'),
        lineNo: 2,
      },
    ]);
    // 같은 줄의 중복이 있어도 서로 다른 시리얼 수(2)와 수량(3)이 다르면 개수 이상도 낸다.
    expect(plan.anomalies.some((a) => a.code === 'SERIAL_COUNT_MISMATCH' && a.lineNo === 1)).toBe(
      true,
    );
  });

  it('이미 다른 제품으로 있는 시리얼은 SERIAL_SKU_CONFLICT 이고 이력을 남기지 않는다', () => {
    const plan = planShipment([line()], {
      ...ordered(order(orderLine({ id: 'A', lineNo: 1 }))),
      unitProducts: new Map([
        ['S1', 'OTHER'],
        ['S2', 'P1'],
      ]),
    });
    expect(plan.anomalies).toEqual([
      {
        code: 'SERIAL_SKU_CONFLICT',
        message: expect.stringContaining('S1'),
        lineNo: 1,
      },
    ]);
    expect(plan.lines[0]?.recordableSerials).toEqual(['S2']);
    // 저장하는 시리얼 목록에는 보고된 그대로 남는다.
    expect(plan.lines[0]?.serialNumbers).toEqual(['S1', 'S2']);
  });

  it('이상 메시지에는 시리얼 예시 다섯 개와 나머지 건수만 싣는다', () => {
    const many = Array.from({ length: 12 }, (_, i) => `S${i}`);
    const plan = planShipment([line({ quantity: 12, serialNumbers: many })], {
      ...ordered(order(orderLine({ id: 'A', lineNo: 1, orderedQty: 99 }))),
      knownSerials: new Set(many),
    });
    expect(plan.anomalies[0]?.message).toBe(
      '다른 선적에 이미 있는 시리얼: S0, S1, S2, S3, S4 외 7건',
    );
  });

  it('선적 전체 이상, 발주 줄 이상, 줄별 시리얼 이상 순으로 놓는다', () => {
    const plan = planShipment(
      [
        line({ serialNumbers: ['S1'] }),
        line({ lineNo: 2, sku: 'NOPE', productId: 'P9', serialNumbers: ['S9'] }),
      ],
      ordered(order(orderLine({ id: 'A', lineNo: 1 }))),
    );
    expect(codes(plan.anomalies)).toEqual([
      'PO_LINE_UNMATCHED',
      'SERIAL_COUNT_MISMATCH',
      'SERIAL_COUNT_MISMATCH',
    ]);
  });
});

describe('planLink', () => {
  const lines = [
    { lineNo: 1, sku: 'CAM-01', productId: 'P1', quantity: 4 },
    { lineNo: 2, sku: 'LENS-01', productId: 'P2', quantity: 1 },
  ];

  it('모든 줄이 발주 줄에 맞으면 줄 연결을 돌려준다', () => {
    const plan = planLink(
      lines,
      order(
        orderLine({ id: 'A', lineNo: 1 }),
        orderLine({ id: 'B', lineNo: 2, productId: 'P2', orderedQty: 5 }),
      ),
      new Map(),
    );
    expect(plan).toEqual({
      ok: true,
      matches: [
        { lineNo: 1, purchaseOrderLineId: 'A' },
        { lineNo: 2, purchaseOrderLineId: 'B' },
      ],
      anomalies: [],
    });
  });

  it('맞는 발주 줄이 없는 선적 줄이 있으면 연결할 수 없다', () => {
    const plan = planLink(lines, order(orderLine({ id: 'A', lineNo: 1 })), new Map());
    expect(plan).toEqual({ ok: false, unmatched: [{ lineNo: 2, sku: 'LENS-01' }] });
  });

  it('연결 시점의 선적 누계로 과납을 찾는다', () => {
    const plan = planLink(
      [lines[0] ?? { lineNo: 1, sku: 'CAM-01', productId: 'P1', quantity: 4 }],
      order(orderLine({ id: 'A', lineNo: 1, orderedQty: 10 })),
      new Map([['A', 8]]),
    );
    expect(plan.ok && codes(plan.anomalies)).toEqual(['OVER_SHIPPED']);
  });
});
