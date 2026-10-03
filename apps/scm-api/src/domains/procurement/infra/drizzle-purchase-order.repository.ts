import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, inArray } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { nextPublicId } from '@repo/db-kit/public-id';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { purchaseOrderLines, purchaseOrderRevisions, purchaseOrders } from '../../../db/schema.js';
import type {
  NewPurchaseOrder,
  NewPurchaseOrderLine,
  NewPurchaseOrderRevision,
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderHeader,
  PurchaseOrderLine,
  PurchaseOrderRevision,
} from '../domain/purchase-order.js';
import type { PurchaseOrderRepository } from '../domain/purchase-order.repository.js';

type OrderRow = typeof purchaseOrders.$inferSelect;
type LineRow = typeof purchaseOrderLines.$inferSelect;

const toOrder = (row: OrderRow): PurchaseOrder => ({ ...row });
const toLine = (row: LineRow): PurchaseOrderLine => ({ ...row });

const newLineRow = (purchaseOrderId: string, line: NewPurchaseOrderLine): LineRow => ({
  id: newId(),
  purchaseOrderId,
  lineNo: line.lineNo,
  productId: line.productId,
  orderedQty: line.orderedQty,
  requestedDeliveryDate: line.requestedDeliveryDate,
  unitPrice: line.unitPrice,
  overTolerancePct: line.overTolerancePct,
  underTolerancePct: line.underTolerancePct,
  closed: false,
  closedAt: null,
  closedBy: null,
  closeReason: null,
  cancelled: false,
});

@Injectable()
export class DrizzlePurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async insert({ lines, ...draft }: NewPurchaseOrder): Promise<PurchaseOrderDetail> {
    const db = this.db.get();
    const row: OrderRow = {
      ...draft,
      id: newId(),
      // usecase 가 연 트랜잭션 안에서 불리므로 카운터 행의 잠금이 커밋까지 유지된다.
      poNumber: await nextPublicId(db, 'PO', draft.createdAt),
    };
    await db.insert(purchaseOrders).values(row);
    const lineRows = lines.map((line) => newLineRow(row.id, line));
    await db.insert(purchaseOrderLines).values(lineRows);
    return { order: toOrder(row), lines: lineRows.map(toLine) };
  }

  async findByPoNumber(poNumber: string): Promise<PurchaseOrderDetail | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.poNumber, poNumber))
      .limit(1);
    return row && (await this.loadDetails([row]))[0];
  }

  async findByPoNumberForUpdate(poNumber: string): Promise<PurchaseOrderDetail | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.poNumber, poNumber))
      .limit(1)
      .for('update');
    return row && (await this.loadDetails([row]))[0];
  }

  async findIdsByPoNumbers(poNumbers: readonly string[]): Promise<Map<string, string>> {
    if (poNumbers.length === 0) return new Map();
    const rows = await this.db
      .get()
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.poNumber, [...poNumbers]));
    return new Map(rows.map((row) => [row.poNumber, row.id]));
  }

  async findByIds(ids: readonly string[]): Promise<PurchaseOrderDetail[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .get()
      .select()
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.id, [...ids]));
    return this.loadDetails(rows);
  }

  async findByIdsForUpdate(ids: readonly string[]): Promise<PurchaseOrderDetail[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .get()
      .select()
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.id, [...ids]))
      .orderBy(asc(purchaseOrders.id))
      .for('update');
    return this.loadDetails(rows);
  }

  async listRecent(limit: number): Promise<PurchaseOrderDetail[]> {
    // id 는 UUIDv7 이라 만든 순서대로 정렬된다.
    const rows = await this.db
      .get()
      .select()
      .from(purchaseOrders)
      .orderBy(desc(purchaseOrders.id))
      .limit(limit);
    return this.loadDetails(rows);
  }

  async replaceDraftContents(
    purchaseOrderId: string,
    header: PurchaseOrderHeader,
    lines: readonly NewPurchaseOrderLine[],
  ): Promise<void> {
    const db = this.db.get();
    await db.update(purchaseOrders).set(header).where(eq(purchaseOrders.id, purchaseOrderId));
    await db
      .delete(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
    await db
      .insert(purchaseOrderLines)
      .values(lines.map((line) => newLineRow(purchaseOrderId, line)));
  }

  async markIssued(purchaseOrderId: string, issuedAt: Date, issuedBy: string): Promise<void> {
    await this.db
      .get()
      .update(purchaseOrders)
      .set({ status: 'ISSUED', issuedAt, issuedBy })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  async markCancelled(purchaseOrderId: string): Promise<void> {
    await this.db
      .get()
      .update(purchaseOrders)
      .set({ status: 'CANCELLED' })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  async saveLine(line: PurchaseOrderLine): Promise<void> {
    await this.db
      .get()
      .update(purchaseOrderLines)
      .set({
        orderedQty: line.orderedQty,
        requestedDeliveryDate: line.requestedDeliveryDate,
        unitPrice: line.unitPrice,
        overTolerancePct: line.overTolerancePct,
        underTolerancePct: line.underTolerancePct,
        closed: line.closed,
        closedAt: line.closedAt,
        closedBy: line.closedBy,
        closeReason: line.closeReason,
        cancelled: line.cancelled,
      })
      .where(eq(purchaseOrderLines.id, line.id));
  }

  async addLines(
    purchaseOrderId: string,
    lines: readonly NewPurchaseOrderLine[],
  ): Promise<PurchaseOrderLine[]> {
    if (lines.length === 0) return [];
    const rows = lines.map((line) => newLineRow(purchaseOrderId, line));
    await this.db.get().insert(purchaseOrderLines).values(rows);
    return rows.map(toLine);
  }

  async addRevision(revision: NewPurchaseOrderRevision): Promise<void> {
    await this.db
      .get()
      .insert(purchaseOrderRevisions)
      .values({ id: newId(), ...revision });
  }

  async listRevisions(purchaseOrderId: string, limit: number): Promise<PurchaseOrderRevision[]> {
    // id 는 UUIDv7 이라 같은 밀리초의 개정도 만든 순서대로 정렬된다.
    return this.db
      .get()
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId))
      .orderBy(desc(purchaseOrderRevisions.revisedAt), desc(purchaseOrderRevisions.id))
      .limit(limit);
  }

  /** 주어진 발주들의 줄을 한 번에 읽어 붙인다. 입력 순서를 유지한다. */
  private async loadDetails(orders: readonly OrderRow[]): Promise<PurchaseOrderDetail[]> {
    if (orders.length === 0) return [];
    const lineRows = await this.db
      .get()
      .select()
      .from(purchaseOrderLines)
      .where(
        inArray(
          purchaseOrderLines.purchaseOrderId,
          orders.map((order) => order.id),
        ),
      )
      .orderBy(asc(purchaseOrderLines.lineNo));
    return orders.map((order) => ({
      order: toOrder(order),
      lines: lineRows.filter((line) => line.purchaseOrderId === order.id).map(toLine),
    }));
  }
}
