import { describe, expect, it } from 'vitest';

import { setupPurchaseOrders } from '../../../testing/memory-purchase-order-repository.js';
import type {
  PurchaseOrderHeader,
  PurchaseOrderLineDraft,
  ReceivedQuantityLookup,
} from '../domain/purchase-order.js';

const header: PurchaseOrderHeader = {
  supplier: 'ACME',
  orderDate: '2026-10-04',
  currency: 'USD',
  destinationLocationId: 'LOC1',
  incoterm: 'FOB',
  incotermPlace: 'Shenzhen',
  supplierOrderRef: null,
  paymentTerms: null,
  remarks: null,
};

const draft = (productId: string, orderedQty: number): PurchaseOrderLineDraft => ({
  productId,
  orderedQty,
  requestedDeliveryDate: '2026-11-01',
  unitPrice: 10,
  overTolerancePct: null,
  underTolerancePct: null,
});

const nothingReceived: ReceivedQuantityLookup = () => Promise.resolve(new Map());
/** 줄 번호별 받은 수량을 흉내 낸다 (줄 id 는 저장소가 정하므로 줄 번호로 찾아 넘긴다). */
const received =
  (repository: { lines: { id: string; lineNo: number }[] }, byLineNo: Record<number, number>) =>
  (): ReturnType<ReceivedQuantityLookup> =>
    Promise.resolve(
      new Map(
        repository.lines.map((line) => [line.id, byLineNo[line.lineNo] ?? 0] as [string, number]),
      ),
    );

const setupIssued = async () => {
  const memory = setupPurchaseOrders();
  const created = await memory.purchaseOrders.create(
    header,
    [draft('P1', 100), draft('P2', 50)],
    'buyer-1',
  );
  const { poNumber } = created.order;
  await memory.purchaseOrders.issue(poNumber, 'buyer-1');
  return { ...memory, poNumber };
};

const revise = (
  memory: Awaited<ReturnType<typeof setupIssued>>,
  changes: Partial<Parameters<typeof memory.purchaseOrders.revise>[2]>,
  lookup: ReceivedQuantityLookup = nothingReceived,
) =>
  memory.purchaseOrders.revise(
    memory.poNumber,
    { reason: '제조사 요청', actor: 'buyer-2' },
    { updateLines: [], cancelLines: [], addLines: [], ...changes },
    lookup,
  );

describe('PurchaseOrderService', () => {
  describe('create / replaceDraft / issue', () => {
    it('초안을 만들고 줄 번호를 1부터 순서대로 붙인다', async () => {
      const { purchaseOrders } = setupPurchaseOrders();

      const { order, lines } = await purchaseOrders.create(
        header,
        [draft('P1', 100), draft('P2', 50)],
        'buyer-1',
      );

      expect(order).toMatchObject({ status: 'DRAFT', createdBy: 'buyer-1', issuedAt: null });
      expect(order.poNumber).toMatch(/^PO-\d{4}-\d{6}$/);
      expect(lines.map((line) => [line.lineNo, line.productId, line.orderedQty])).toEqual([
        [1, 'P1', 100],
        [2, 'P2', 50],
      ]);
    });

    it('초안은 줄까지 통째로 바꿀 수 있고 이력을 남기지 않는다', async () => {
      const { purchaseOrders, repository } = setupPurchaseOrders();
      const { order } = await purchaseOrders.create(header, [draft('P1', 100)], 'buyer-1');

      const updated = await purchaseOrders.replaceDraft(
        order.poNumber,
        { ...header, supplier: 'BETA' },
        [draft('P3', 7)],
      );

      expect(updated.order.supplier).toBe('BETA');
      expect(updated.lines.map((line) => [line.lineNo, line.productId])).toEqual([[1, 'P3']]);
      expect(repository.revisions).toEqual([]);
    });

    it('발행하면 ISSUED 가 되고 발행 시각과 처리자가 남는다', async () => {
      const { purchaseOrders } = setupPurchaseOrders();
      const { order } = await purchaseOrders.create(header, [draft('P1', 100)], 'buyer-1');

      const issued = await purchaseOrders.issue(order.poNumber, 'buyer-2');

      expect(issued.order).toMatchObject({ status: 'ISSUED', issuedBy: 'buyer-2' });
      expect(issued.order.issuedAt).toBeInstanceOf(Date);
    });

    it('발행된 발주는 초안처럼 고치거나 다시 발행할 수 없다', async () => {
      const { purchaseOrders, poNumber } = await setupIssued();

      await expect(
        purchaseOrders.replaceDraft(poNumber, header, [draft('P1', 1)]),
      ).rejects.toMatchObject({
        code: 'PO_NOT_DRAFT',
      });
      await expect(purchaseOrders.issue(poNumber, 'buyer-1')).rejects.toMatchObject({
        code: 'PO_NOT_DRAFT',
      });
    });

    it('없는 발주는 PO_NOT_FOUND 다', async () => {
      const { purchaseOrders } = setupPurchaseOrders();

      await expect(purchaseOrders.get('PO-2026-999999')).rejects.toMatchObject({
        code: 'PO_NOT_FOUND',
      });
      await expect(purchaseOrders.issue('PO-2026-999999', 'x')).rejects.toMatchObject({
        code: 'PO_NOT_FOUND',
      });
    });
  });

  describe('revise', () => {
    it('수량·납기를 바꾸고 변경 전후 전체를 개정 이력에 남긴다', async () => {
      const memory = await setupIssued();

      const after = await revise(memory, {
        updateLines: [{ lineNo: 1, orderedQty: 120, requestedDeliveryDate: '2026-12-01' }],
      });

      expect(after.lines[0]).toMatchObject({
        orderedQty: 120,
        requestedDeliveryDate: '2026-12-01',
      });
      const [revision] = await memory.purchaseOrders.listRevisions(memory.poNumber);
      expect(revision).toMatchObject({ actor: 'buyer-2', reason: '제조사 요청' });
      expect(revision?.before.lines[0]).toMatchObject({
        orderedQty: 100,
        requestedDeliveryDate: '2026-11-01',
      });
      expect(revision?.after.lines[0]).toMatchObject({
        orderedQty: 120,
        requestedDeliveryDate: '2026-12-01',
      });
      // 바뀌지 않은 줄도 스냅샷에 들어 있다.
      expect(revision?.before.lines).toHaveLength(2);
      expect(revision?.after.lines).toHaveLength(2);
    });

    it('줄을 추가하고 취소하며, 취소한 줄도 번호를 비우지 않는다', async () => {
      const memory = await setupIssued();

      const after = await revise(memory, {
        cancelLines: [2],
        addLines: [draft('P9', 5)],
      });

      expect(after.lines.map((line) => [line.lineNo, line.productId, line.cancelled])).toEqual([
        [1, 'P1', false],
        [2, 'P2', true],
        [3, 'P9', false],
      ]);
    });

    it('받은 수량 아래로 줄이면 거절하고 아무것도 바꾸지 않는다', async () => {
      const memory = await setupIssued();

      await expect(
        revise(
          memory,
          { updateLines: [{ lineNo: 1, orderedQty: 59 }], addLines: [draft('P9', 5)] },
          received(memory.repository, { 1: 60 }),
        ),
      ).rejects.toMatchObject({
        code: 'PO_QTY_BELOW_RECEIVED',
        details: { lineNo: 1, receivedQty: 60, requestedQty: 59 },
      });

      expect((await memory.purchaseOrders.get(memory.poNumber)).lines).toHaveLength(2);
      expect(memory.repository.revisions).toEqual([]);
    });

    it('바뀐 것이 없으면 개정 이력을 남기지 않는다', async () => {
      const memory = await setupIssued();

      await revise(memory, { updateLines: [{ lineNo: 1, orderedQty: 100 }] });

      expect(memory.repository.revisions).toEqual([]);
    });

    it('초안과 취소된 발주는 개정할 수 없다', async () => {
      const { purchaseOrders } = setupPurchaseOrders();
      const { order } = await purchaseOrders.create(header, [draft('P1', 100)], 'buyer-1');

      await expect(
        purchaseOrders.revise(
          order.poNumber,
          { reason: 'r', actor: 'a' },
          { updateLines: [], cancelLines: [], addLines: [draft('P2', 1)] },
          nothingReceived,
        ),
      ).rejects.toMatchObject({ code: 'PO_NOT_ISSUED' });
    });

    it('없는 줄과 취소한 줄은 거절한다', async () => {
      const memory = await setupIssued();
      await revise(memory, { cancelLines: [2] });

      await expect(
        revise(memory, { updateLines: [{ lineNo: 9, orderedQty: 1 }] }),
      ).rejects.toMatchObject({
        code: 'PO_LINE_NOT_FOUND',
      });
      await expect(revise(memory, { cancelLines: [2] })).rejects.toMatchObject({
        code: 'PO_LINE_CANCELLED',
      });
    });
  });

  describe('closeLine', () => {
    const close = (
      memory: Awaited<ReturnType<typeof setupIssued>>,
      lineNo: number,
      lookup: ReceivedQuantityLookup = nothingReceived,
    ) =>
      memory.purchaseOrders.closeLine(
        memory.poNumber,
        lineNo,
        { reason: '제조사가 더 못 보낸다고 함', actor: 'buyer-1' },
        lookup,
      );

    it('덜 온 줄을 닫으면 닫은 시각·처리자·사유가 남는다', async () => {
      const memory = await setupIssued();

      const after = await close(memory, 1, received(memory.repository, { 1: 60 }));

      expect(after.lines[0]).toMatchObject({
        closed: true,
        closedBy: 'buyer-1',
        closeReason: '제조사가 더 못 보낸다고 함',
      });
      expect(after.lines[0]?.closedAt).toBeInstanceOf(Date);
      expect(after.lines[1]?.closed).toBe(false);
    });

    it('이미 닫은 줄은 PO_LINE_ALREADY_CLOSED 다', async () => {
      const memory = await setupIssued();
      await close(memory, 1);

      await expect(close(memory, 1)).rejects.toMatchObject({ code: 'PO_LINE_ALREADY_CLOSED' });
    });

    it('다 받은 줄은 닫을 수 없다', async () => {
      const memory = await setupIssued();

      await expect(close(memory, 1, received(memory.repository, { 1: 100 }))).rejects.toMatchObject(
        {
          code: 'PO_LINE_ALREADY_COMPLETE',
        },
      );
    });

    it('없는 줄은 PO_LINE_NOT_FOUND, 초안의 줄은 PO_NOT_ISSUED 다', async () => {
      const memory = await setupIssued();
      await expect(close(memory, 9)).rejects.toMatchObject({ code: 'PO_LINE_NOT_FOUND' });

      const draftOrder = await memory.purchaseOrders.create(header, [draft('P1', 1)], 'buyer-1');
      await expect(
        memory.purchaseOrders.closeLine(
          draftOrder.order.poNumber,
          1,
          { reason: 'r', actor: 'a' },
          nothingReceived,
        ),
      ).rejects.toMatchObject({ code: 'PO_NOT_ISSUED' });
    });
  });

  describe('cancel', () => {
    const cancel = (memory: Awaited<ReturnType<typeof setupIssued>>, lookup = nothingReceived) =>
      memory.purchaseOrders.cancel(
        memory.poNumber,
        { reason: '발주 철회', actor: 'buyer-1' },
        lookup,
      );

    it('받은 것이 없으면 취소되고, 발행된 발주의 취소는 개정 이력에 남는다', async () => {
      const memory = await setupIssued();

      const after = await cancel(memory);

      expect(after.order.status).toBe('CANCELLED');
      const [revision] = await memory.purchaseOrders.listRevisions(memory.poNumber);
      expect(revision).toMatchObject({ reason: '발주 철회', actor: 'buyer-1' });
      expect(revision?.before.status).toBe('ISSUED');
      expect(revision?.after.status).toBe('CANCELLED');
    });

    it('초안의 취소는 이력을 남기지 않는다', async () => {
      const { purchaseOrders, repository } = setupPurchaseOrders();
      const { order } = await purchaseOrders.create(header, [draft('P1', 1)], 'buyer-1');

      const after = await purchaseOrders.cancel(
        order.poNumber,
        { reason: 'r', actor: 'a' },
        nothingReceived,
      );

      expect(after.order.status).toBe('CANCELLED');
      expect(repository.revisions).toEqual([]);
    });

    it('받은 것이 있으면 PO_HAS_RECEIPTS 로 거절하고 어느 줄인지 알려 준다', async () => {
      const memory = await setupIssued();

      await expect(cancel(memory, received(memory.repository, { 2: 1 }))).rejects.toMatchObject({
        code: 'PO_HAS_RECEIPTS',
        details: { lineNos: [2] },
      });
      expect((await memory.purchaseOrders.get(memory.poNumber)).order.status).toBe('ISSUED');
    });

    it('이미 취소된 발주는 PO_ALREADY_CANCELLED 이고, 취소된 발주는 개정할 수 없다', async () => {
      const memory = await setupIssued();
      await cancel(memory);

      await expect(cancel(memory)).rejects.toMatchObject({ code: 'PO_ALREADY_CANCELLED' });
      await expect(revise(memory, { cancelLines: [1] })).rejects.toMatchObject({
        code: 'PO_NOT_ISSUED',
      });
    });
  });
});
