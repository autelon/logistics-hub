import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import type {
  NewPurchaseOrder,
  NewPurchaseOrderLine,
  NewPurchaseOrderRevision,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderHeader,
  PurchaseOrderLine,
  PurchaseOrderRevision,
} from '../domains/procurement/domain/purchase-order.js';
import type { PurchaseOrderRepository } from '../domains/procurement/domain/purchase-order.repository.js';

// 발주 도메인의 단위 테스트용 메모리 구현 (docs/testing.md). 빌드에는 들어가지 않는다.

export class MemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  orders: PurchaseOrder[] = [];
  lines: PurchaseOrderLine[] = [];
  revisions: PurchaseOrderRevision[] = [];
  private seq = 0;

  private detailOf(order: PurchaseOrder): PurchaseOrderDetail {
    return {
      order: { ...order },
      lines: this.lines
        .filter((line) => line.purchaseOrderId === order.id)
        .toSorted((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({ ...line })),
    };
  }

  private toLine(purchaseOrderId: string, line: NewPurchaseOrderLine): PurchaseOrderLine {
    return {
      ...line,
      id: `L${++this.seq}`,
      purchaseOrderId,
      closed: false,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      cancelled: false,
    };
  }

  insert({ lines, ...draft }: NewPurchaseOrder) {
    const order: PurchaseOrder = {
      ...draft,
      id: `O${++this.seq}`,
      poNumber: `PO-2026-${String(this.orders.length + 1).padStart(6, '0')}`,
    };
    this.orders.push(order);
    this.lines.push(...lines.map((line) => this.toLine(order.id, line)));
    return Promise.resolve(this.detailOf(order));
  }
  findByPoNumber(poNumber: string) {
    const order = this.orders.find((o) => o.poNumber === poNumber);
    return Promise.resolve(order && this.detailOf(order));
  }
  findByPoNumberForUpdate(poNumber: string) {
    return this.findByPoNumber(poNumber);
  }
  listRecent(limit: number) {
    return Promise.resolve(
      this.orders
        .toReversed()
        .slice(0, limit)
        .map((order) => this.detailOf(order)),
    );
  }
  replaceDraftContents(
    purchaseOrderId: string,
    header: PurchaseOrderHeader,
    lines: readonly NewPurchaseOrderLine[],
  ) {
    const order = this.orders.find((o) => o.id === purchaseOrderId);
    if (order) Object.assign(order, header);
    this.lines = this.lines.filter((line) => line.purchaseOrderId !== purchaseOrderId);
    this.lines.push(...lines.map((line) => this.toLine(purchaseOrderId, line)));
    return Promise.resolve();
  }
  markIssued(purchaseOrderId: string, issuedAt: Date, issuedBy: string) {
    const order = this.orders.find((o) => o.id === purchaseOrderId);
    if (order) Object.assign(order, { status: 'ISSUED', issuedAt, issuedBy });
    return Promise.resolve();
  }
  markCancelled(purchaseOrderId: string) {
    const order = this.orders.find((o) => o.id === purchaseOrderId);
    if (order) order.status = 'CANCELLED';
    return Promise.resolve();
  }
  saveLine(line: PurchaseOrderLine) {
    const index = this.lines.findIndex((l) => l.id === line.id);
    if (index >= 0) this.lines[index] = { ...line };
    return Promise.resolve();
  }
  addLines(purchaseOrderId: string, lines: readonly NewPurchaseOrderLine[]) {
    const added = lines.map((line) => this.toLine(purchaseOrderId, line));
    this.lines.push(...added);
    return Promise.resolve(added);
  }
  addRevision(revision: NewPurchaseOrderRevision) {
    this.revisions.push({ ...revision, id: `R${++this.seq}` });
    return Promise.resolve();
  }
  listRevisions(purchaseOrderId: string, limit: number) {
    return Promise.resolve(
      this.revisions
        .filter((revision) => revision.purchaseOrderId === purchaseOrderId)
        .toReversed()
        .slice(0, limit),
    );
  }
}

export const setupPurchaseOrders = () => {
  const repository = new MemoryPurchaseOrderRepository();
  return { repository, purchaseOrders: new PurchaseOrderService(repository) };
};
