import { describe, expect, it } from 'vitest';

import { reviseLines, type RevisionChanges } from './purchase-order-revision.js';
import type { PurchaseOrderLine } from './purchase-order.js';

const line = (lineNo: number, overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine => ({
  id: `L${lineNo}`,
  purchaseOrderId: 'PO1',
  lineNo,
  productId: `P${lineNo}`,
  orderedQty: 100,
  requestedDeliveryDate: '2026-11-01',
  unitPrice: 10,
  overTolerancePct: null,
  underTolerancePct: null,
  closed: false,
  closedAt: null,
  closedBy: null,
  closeReason: null,
  cancelled: false,
  ...overrides,
});

const changes = (partial: Partial<RevisionChanges>): RevisionChanges => ({
  updateLines: [],
  cancelLines: [],
  addLines: [],
  ...partial,
});

const NOTHING_RECEIVED = new Map<string, number>();

describe('reviseLines', () => {
  it('보낸 항목만 바꾸고 나머지는 그대로 둔다', () => {
    const result = reviseLines(
      [line(1), line(2)],
      changes({
        updateLines: [{ lineNo: 2, orderedQty: 150, requestedDeliveryDate: '2026-12-01' }],
      }),
      NOTHING_RECEIVED,
    );

    expect(result).toEqual({
      ok: true,
      updated: [line(2, { orderedQty: 150, requestedDeliveryDate: '2026-12-01' })],
      added: [],
    });
  });

  it('null 을 보내면 값을 비우고, 키가 없으면 그대로 둔다', () => {
    const result = reviseLines(
      [line(1, { unitPrice: 10, overTolerancePct: 5 })],
      changes({ updateLines: [{ lineNo: 1, unitPrice: null }] }),
      NOTHING_RECEIVED,
    );

    expect(result.ok && result.updated[0]).toMatchObject({ unitPrice: null, overTolerancePct: 5 });
  });

  it('줄을 취소한다', () => {
    const result = reviseLines([line(1)], changes({ cancelLines: [1] }), NOTHING_RECEIVED);

    expect(result).toEqual({ ok: true, updated: [line(1, { cancelled: true })], added: [] });
  });

  it('줄 번호는 취소한 줄을 포함한 최대 번호 다음부터 붙는다', () => {
    const draft = {
      productId: 'P9',
      orderedQty: 5,
      requestedDeliveryDate: '2026-11-15',
      unitPrice: null,
      overTolerancePct: null,
      underTolerancePct: null,
    };
    const result = reviseLines(
      [line(1), line(2, { cancelled: true })],
      changes({ addLines: [draft, { ...draft, productId: 'P10' }] }),
      NOTHING_RECEIVED,
    );

    expect(result.ok && result.added.map((l) => [l.lineNo, l.productId])).toEqual([
      [3, 'P9'],
      [4, 'P10'],
    ]);
  });

  it('없는 줄은 거절한다', () => {
    const result = reviseLines(
      [line(1)],
      changes({ updateLines: [{ lineNo: 7, orderedQty: 1 }] }),
      NOTHING_RECEIVED,
    );

    expect(result).toEqual({ ok: false, refusal: { code: 'PO_LINE_NOT_FOUND', lineNo: 7 } });
  });

  it('취소한 줄과 닫은 줄은 바꾸거나 다시 취소할 수 없다', () => {
    const lines = [line(1, { cancelled: true }), line(2, { closed: true })];

    expect(
      reviseLines(
        lines,
        changes({ updateLines: [{ lineNo: 1, orderedQty: 1 }] }),
        NOTHING_RECEIVED,
      ),
    ).toEqual({ ok: false, refusal: { code: 'PO_LINE_CANCELLED', lineNo: 1 } });
    expect(reviseLines(lines, changes({ cancelLines: [2] }), NOTHING_RECEIVED)).toEqual({
      ok: false,
      refusal: { code: 'PO_LINE_ALREADY_CLOSED', lineNo: 2 },
    });
  });

  it('주문 수량을 이미 받은 수량 아래로 줄이는 것은 거절하고, 같게 줄이는 것은 허용한다', () => {
    const received = new Map([['L1', 60]]);

    expect(
      reviseLines([line(1)], changes({ updateLines: [{ lineNo: 1, orderedQty: 59 }] }), received),
    ).toEqual({
      ok: false,
      refusal: { code: 'PO_QTY_BELOW_RECEIVED', lineNo: 1, receivedQty: 60, requestedQty: 59 },
    });
    expect(
      reviseLines([line(1)], changes({ updateLines: [{ lineNo: 1, orderedQty: 60 }] }), received)
        .ok,
    ).toBe(true);
  });

  it('받은 것이 있는 줄은 취소할 수 없다', () => {
    const result = reviseLines([line(1)], changes({ cancelLines: [1] }), new Map([['L1', 1]]));

    expect(result).toEqual({
      ok: false,
      refusal: { code: 'PO_QTY_BELOW_RECEIVED', lineNo: 1, receivedQty: 1, requestedQty: 0 },
    });
  });

  it('하나라도 거절되면 아무것도 적용하지 않는다', () => {
    const result = reviseLines(
      [line(1), line(2)],
      changes({
        updateLines: [{ lineNo: 1, orderedQty: 200 }],
        cancelLines: [9],
      }),
      NOTHING_RECEIVED,
    );

    expect(result.ok).toBe(false);
  });
});
