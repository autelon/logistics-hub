import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { DoaConfirmed } from '@repo/contracts/as';
import { makeEvent, Topics } from '@repo/contracts/common';
import type { FulfillmentRequested, IngestOrderRequest, OrderView } from '@repo/contracts/oms';
import type { ScmUnitMessage } from '@repo/contracts/scm';
import { newId } from '@repo/db-kit/columns';
import { claimMessage } from '@repo/db-kit/inbox';
import { enqueue } from '@repo/db-kit/outbox';
import { DB } from '@repo/nest-kit/infra.module';

import type { Db, Tx } from '../db/db.js';
import {
  fulfillmentItems,
  orderLines,
  orders,
  sellableComponents,
  sellables,
} from '../db/schema.js';
import {
  orderStatusOf,
  pickItemForShipment,
  planOrder,
  UnknownSellableError,
  type SellableDefinition,
} from './fulfillment.js';

export const CONSUMER_GROUP = 'oms-api';

type OrderRow = typeof orders.$inferSelect;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /** 채널 주문을 받아 물리 출고 단위로 풀고 출고를 요청한다. 같은 채널 주문번호는 한 번만 받는다. */
  async ingest(request: IngestOrderRequest): Promise<{ orderId: string; duplicate: boolean }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.channel, request.channel),
            eq(orders.channelOrderNo, request.channelOrderNo),
          ),
        )
        .limit(1);
      if (existing) return { orderId: existing.id, duplicate: true };

      const definitions = await this.loadSellables(tx, [
        ...new Set(request.lines.map((l) => l.sellableCode)),
      ]);
      let plan;
      try {
        plan = planOrder(request.lines, definitions);
      } catch (error) {
        if (error instanceof UnknownSellableError) {
          throw new UnprocessableEntityException(error.message);
        }
        throw error;
      }

      const now = new Date();
      const order: OrderRow = {
        id: newId(),
        channel: request.channel,
        channelOrderNo: request.channelOrderNo,
        orderedAt: new Date(request.orderedAt),
        createdAt: now,
      };
      await tx.insert(orders).values(order);

      const lines = plan.map((line) => ({ ...line, id: newId() }));
      await tx
        .insert(orderLines)
        .values(lines.map(({ skus: _skus, ...line }) => ({ ...line, orderId: order.id })));

      const items = lines.flatMap((line) =>
        line.skus.map((sku) => ({
          id: newId(),
          orderId: order.id,
          orderLineId: line.id,
          sku,
          status: 'PENDING' as const,
          reason: 'ORDER' as const,
          createdAt: now,
        })),
      );
      await tx.insert(fulfillmentItems).values(items);

      await this.requestFulfillment(
        tx,
        order,
        items.map((i) => ({
          fulfillmentItemId: i.id,
          sku: i.sku,
          reason: i.reason,
          replacesItemId: null,
        })),
      );
      return { orderId: order.id, duplicate: false };
    });
  }

  async get(orderId: string): Promise<OrderView> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const [view] = await this.toViews([order]);
    return view!;
  }

  async listRecent(): Promise<OrderView[]> {
    const rows = await this.db.select().from(orders).orderBy(desc(orders.id)).limit(50);
    return this.toViews(rows);
  }

  /** SCM 이 알려 주는 물리 제품의 출고·배송, 그리고 그 사실의 정정을 주문에 반영한다. */
  async applyUnitMessage(message: ScmUnitMessage): Promise<void> {
    const { orderRef, eventType, serialNumber, sku, occurredAt } = message.payload;
    if (!orderRef || (eventType !== 'SHIPPED' && eventType !== 'DELIVERED')) return;

    await this.db.transaction(async (tx) => {
      if (!(await claimMessage(tx, CONSUMER_GROUP, message.id))) return;

      const items = await tx
        .select()
        .from(fulfillmentItems)
        .where(eq(fulfillmentItems.orderId, orderRef.orderId))
        .for('update');
      const linked = items.find((i) => i.serialNumber === serialNumber);
      const at = new Date(occurredAt);

      if (message.type === 'scm.unit.event-recorded' && eventType === 'SHIPPED') {
        const item = pickItemForShipment(items, {
          sku,
          fulfillmentItemId: orderRef.fulfillmentItemId,
        });
        if (!item) {
          this.logger.error(
            `Shipment of ${serialNumber} (${sku}) matches no pending item of order ${orderRef.orderId}`,
          );
          return;
        }
        await this.updateItem(tx, item.id, { status: 'SHIPPED', serialNumber, shippedAt: at });
      } else if (message.type === 'scm.unit.event-recorded') {
        if (linked?.status === 'SHIPPED') {
          await this.updateItem(tx, linked.id, { status: 'DELIVERED', deliveredAt: at });
        }
      } else if (eventType === 'SHIPPED') {
        // 출고 자체가 잘못된 보고였다 → 시리얼을 떼고 다시 출고 대기로.
        if (linked?.status === 'SHIPPED' || linked?.status === 'DELIVERED') {
          await this.updateItem(tx, linked.id, {
            status: 'PENDING',
            serialNumber: null,
            shippedAt: null,
            deliveredAt: null,
          });
        }
      } else if (linked?.status === 'DELIVERED') {
        await this.updateItem(tx, linked.id, { status: 'SHIPPED', deliveredAt: null });
      }
    });
  }

  /** 판매 출고품이 DOA 로 확정되면 그 항목을 불량 처리하고 교체 출고를 요청한다. */
  async applyDoaConfirmed(message: DoaConfirmed): Promise<void> {
    const { serialNumber, caseId } = message.payload;

    await this.db.transaction(async (tx) => {
      if (!(await claimMessage(tx, CONSUMER_GROUP, message.id))) return;

      const [found] = await tx
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
      // 주문으로 나간 적 없는 제품(예: AS 교체품)의 DOA 는 주문과 무관하다. SCM 이 추적한다.
      if (!found) return;

      await this.updateItem(tx, found.item.id, { status: 'DOA', doaCaseId: caseId });
      const replacement = {
        id: newId(),
        orderId: found.item.orderId,
        orderLineId: found.item.orderLineId,
        sku: found.item.sku,
        status: 'PENDING' as const,
        reason: 'DOA_REPLACEMENT' as const,
        replacesItemId: found.item.id,
        createdAt: new Date(),
      };
      await tx.insert(fulfillmentItems).values(replacement);
      await this.requestFulfillment(tx, found.order, [
        {
          fulfillmentItemId: replacement.id,
          sku: replacement.sku,
          reason: replacement.reason,
          replacesItemId: replacement.replacesItemId,
        },
      ]);
    });
  }

  private async updateItem(
    tx: Tx,
    itemId: string,
    values: Partial<typeof fulfillmentItems.$inferInsert>,
  ) {
    await tx.update(fulfillmentItems).set(values).where(eq(fulfillmentItems.id, itemId));
  }

  private async requestFulfillment(
    tx: Tx,
    order: OrderRow,
    items: FulfillmentRequested['payload']['items'],
  ) {
    await enqueue(
      tx,
      Topics.omsOrderEvents,
      order.id,
      makeEvent('oms.fulfillment.requested', {
        orderId: order.id,
        channel: order.channel,
        channelOrderNo: order.channelOrderNo,
        requestedAt: new Date().toISOString(),
        items,
      }) satisfies FulfillmentRequested,
    );
  }

  private async loadSellables(tx: Tx, codes: string[]): Promise<Map<string, SellableDefinition>> {
    const rows = await tx
      .select({ sellable: sellables, component: sellableComponents })
      .from(sellables)
      .innerJoin(sellableComponents, eq(sellableComponents.sellableCode, sellables.code))
      .where(inArray(sellables.code, codes))
      .orderBy(asc(sellables.code), asc(sellableComponents.sku));

    const result = new Map<
      string,
      SellableDefinition & { components: { sku: string; quantity: number }[] }
    >();
    for (const { sellable, component } of rows) {
      const definition = result.get(sellable.code) ?? { ...sellable, components: [] };
      definition.components.push({ sku: component.sku, quantity: component.quantity });
      result.set(sellable.code, definition);
    }
    return result;
  }

  private async toViews(rows: OrderRow[]): Promise<OrderView[]> {
    if (rows.length === 0) return [];
    const orderIds = rows.map((o) => o.id);
    const lines = await this.db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds))
      .orderBy(asc(orderLines.lineNo));
    const items = await this.db
      .select()
      .from(fulfillmentItems)
      .where(inArray(fulfillmentItems.orderId, orderIds))
      .orderBy(asc(fulfillmentItems.id));

    return rows.map((order) => {
      const orderItems = items.filter((i) => i.orderId === order.id);
      return {
        id: order.id,
        channel: order.channel,
        channelOrderNo: order.channelOrderNo,
        orderedAt: order.orderedAt.toISOString(),
        status: orderStatusOf(orderItems.map((i) => i.status)),
        lines: lines
          .filter((l) => l.orderId === order.id)
          .map((line) => ({
            id: line.id,
            lineNo: line.lineNo,
            sellableCode: line.sellableCode,
            sellableName: line.sellableName,
            sellableKind: line.sellableKind,
            quantity: line.quantity,
            items: orderItems
              .filter((i) => i.orderLineId === line.id)
              .map((item) => ({
                id: item.id,
                sku: item.sku,
                status: item.status,
                reason: item.reason,
                replacesItemId: item.replacesItemId,
                serialNumber: item.serialNumber,
                shippedAt: item.shippedAt?.toISOString() ?? null,
                deliveredAt: item.deliveredAt?.toISOString() ?? null,
                doaCaseId: item.doaCaseId,
              })),
          })),
      };
    });
  }
}
