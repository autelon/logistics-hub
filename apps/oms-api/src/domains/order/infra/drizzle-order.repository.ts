import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { nextPublicId } from '@repo/db-kit/public-id';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { fulfillmentItems, orderLines, orders } from '../../../db/schema.js';
import type { PlannedLine } from '../domain/fulfillment.js';
import type {
  FulfillmentItem,
  FulfillmentItemPatch,
  NewFulfillmentItem,
  NewOrder,
  Order,
  OrderDetail,
  OrderLine,
} from '../domain/order.js';
import type { OrderRepository } from '../domain/order.repository.js';

type OrderRow = typeof orders.$inferSelect;
type OrderLineRow = typeof orderLines.$inferSelect;
type FulfillmentItemRow = typeof fulfillmentItems.$inferSelect;

/** 행과 도메인 타입의 컬럼이 같아 그대로 복사한다. 행 타입이 밖으로 새지 않게 여기서 끊는다. */
const toOrder = (row: OrderRow): Order => ({ ...row });
const toLine = (row: OrderLineRow): OrderLine => ({ ...row });
const toItem = (row: FulfillmentItemRow): FulfillmentItem => ({ ...row });

@Injectable()
export class DrizzleOrderRepository implements OrderRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async findByChannelOrderNo(channel: string, channelOrderNo: string): Promise<Order | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(orders)
      .where(and(eq(orders.channel, channel), eq(orders.channelOrderNo, channelOrderNo)))
      .limit(1);
    return row && toOrder(row);
  }

  async findDetailById(orderId: string): Promise<OrderDetail | undefined> {
    const [row] = await this.db.get().select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!row) return undefined;
    const [detail] = await this.loadDetails([row]);
    return detail;
  }

  async findRecentDetails(limit: number): Promise<OrderDetail[]> {
    const rows = await this.db.get().select().from(orders).orderBy(desc(orders.id)).limit(limit);
    return this.loadDetails(rows);
  }

  async create(order: NewOrder, plan: readonly PlannedLine[]): Promise<OrderDetail> {
    const db = this.db.get();
    const now = new Date();
    const orderRow: OrderRow = {
      id: newId(),
      // usecase 가 연 트랜잭션 안에서 불리므로 카운터 행의 잠금이 커밋까지 유지된다.
      publicId: await nextPublicId(db, 'ORD', now),
      channel: order.channel,
      channelOrderNo: order.channelOrderNo,
      orderedAt: order.orderedAt,
      createdAt: now,
    };
    await db.insert(orders).values(orderRow);

    const lineRows: OrderLineRow[] = plan.map(({ skus: _skus, ...line }) => ({
      ...line,
      id: newId(),
      orderId: orderRow.id,
    }));
    await db.insert(orderLines).values(lineRows);

    const itemRows: FulfillmentItemRow[] = plan.flatMap((line, index) =>
      line.skus.map((sku) => ({
        id: newId(),
        orderId: orderRow.id,
        orderLineId: lineRows[index]!.id,
        sku,
        status: 'PENDING' as const,
        reason: 'ORDER' as const,
        replacesItemId: null,
        serialNumber: null,
        shippedAt: null,
        deliveredAt: null,
        doaCaseId: null,
        createdAt: now,
      })),
    );
    await db.insert(fulfillmentItems).values(itemRows);

    return { order: toOrder(orderRow), lines: lineRows.map(toLine), items: itemRows.map(toItem) };
  }

  async findItemsByOrderIdForUpdate(orderId: string): Promise<FulfillmentItem[]> {
    const rows = await this.db
      .get()
      .select()
      .from(fulfillmentItems)
      .where(eq(fulfillmentItems.orderId, orderId))
      .for('update');
    return rows.map(toItem);
  }

  async findShippedItemBySerialForUpdate(
    serialNumber: string,
  ): Promise<{ item: FulfillmentItem; order: Order } | undefined> {
    const [found] = await this.db
      .get()
      .select({ item: fulfillmentItems, order: orders })
      .from(fulfillmentItems)
      .innerJoin(orders, eq(orders.id, fulfillmentItems.orderId))
      .where(
        and(
          eq(fulfillmentItems.serialNumber, serialNumber),
          inArray(fulfillmentItems.status, ['SHIPPED', 'DELIVERED']),
        ),
      )
      .for('update');
    return found && { item: toItem(found.item), order: toOrder(found.order) };
  }

  async updateItem(itemId: string, patch: FulfillmentItemPatch): Promise<void> {
    await this.db.get().update(fulfillmentItems).set(patch).where(eq(fulfillmentItems.id, itemId));
  }

  async addItem(item: NewFulfillmentItem): Promise<FulfillmentItem> {
    const row: FulfillmentItemRow = {
      ...item,
      id: newId(),
      serialNumber: null,
      shippedAt: null,
      deliveredAt: null,
      doaCaseId: null,
      createdAt: new Date(),
    };
    await this.db.get().insert(fulfillmentItems).values(row);
    return toItem(row);
  }

  /** 주문 목록의 줄과 항목을 두 번의 쿼리로 모아 주문별로 나눈다. */
  private async loadDetails(rows: OrderRow[]): Promise<OrderDetail[]> {
    if (rows.length === 0) return [];
    const db = this.db.get();
    const orderIds = rows.map((o) => o.id);
    const lines = await db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds))
      .orderBy(asc(orderLines.lineNo));
    const items = await db
      .select()
      .from(fulfillmentItems)
      .where(inArray(fulfillmentItems.orderId, orderIds))
      .orderBy(asc(fulfillmentItems.id));

    return rows.map((order) => ({
      order: toOrder(order),
      lines: lines.filter((l) => l.orderId === order.id).map(toLine),
      items: items.filter((i) => i.orderId === order.id).map(toItem),
    }));
  }
}
