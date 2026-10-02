import { index, int, mysqlTable, primaryKey, unique, varchar } from 'drizzle-orm/mysql-core';

import type { FulfillmentItemStatus, FulfillmentReason, SellableKind } from '@repo/contracts/oms';
import { idColumn, utcDateTime } from '@repo/db-kit/columns';
import { processedMessages } from '@repo/db-kit/inbox';
import { outboxEvents } from '@repo/db-kit/outbox';

export { outboxEvents, processedMessages };

/** 채널에서 파는 단위. 단품도 "구성품 1개짜리"로 같은 구조에 담는다. */
export const sellables = mysqlTable('sellables', {
  code: varchar({ length: 64 }).primaryKey(),
  name: varchar({ length: 200 }).notNull(),
  kind: varchar({ length: 16 }).$type<SellableKind>().notNull(),
  createdAt: utcDateTime().notNull(),
});

export const sellableComponents = mysqlTable(
  'sellable_components',
  {
    sellableCode: varchar({ length: 64 })
      .notNull()
      .references(() => sellables.code),
    sku: varchar({ length: 64 }).notNull(),
    quantity: int().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sellableCode, t.sku] })],
);

export const orders = mysqlTable(
  'orders',
  {
    id: idColumn().primaryKey(),
    channel: varchar({ length: 50 }).notNull(),
    channelOrderNo: varchar({ length: 100 }).notNull(),
    orderedAt: utcDateTime().notNull(),
    createdAt: utcDateTime().notNull(),
  },
  (t) => [unique('orders_channel_order_uq').on(t.channel, t.channelOrderNo)],
);

/** 고객이 주문한 그대로의 줄. 판매 상품 이름·종류는 주문 시점 값을 복사해 둔다. */
export const orderLines = mysqlTable(
  'order_lines',
  {
    id: idColumn().primaryKey(),
    orderId: idColumn()
      .notNull()
      .references(() => orders.id),
    lineNo: int().notNull(),
    sellableCode: varchar({ length: 64 }).notNull(),
    sellableName: varchar({ length: 200 }).notNull(),
    sellableKind: varchar({ length: 16 }).$type<SellableKind>().notNull(),
    quantity: int().notNull(),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId)],
);

/**
 * 출고해야 할 물리 제품 한 개. 패키지 주문은 구성품 수만큼 이 행으로 풀린다.
 * 출고가 보고되면 여기에 시리얼이 붙어 "어느 주문의 어느 패키지에 어떤 SN 이 나갔는지"가 된다.
 */
export const fulfillmentItems = mysqlTable(
  'fulfillment_items',
  {
    id: idColumn().primaryKey(),
    orderId: idColumn()
      .notNull()
      .references(() => orders.id),
    orderLineId: idColumn()
      .notNull()
      .references(() => orderLines.id),
    sku: varchar({ length: 64 }).notNull(),
    status: varchar({ length: 16 }).$type<FulfillmentItemStatus>().notNull(),
    reason: varchar({ length: 32 }).$type<FulfillmentReason>().notNull(),
    /** DOA 교체 출고인 경우, 불량이었던 원래 항목. */
    replacesItemId: idColumn(),
    serialNumber: varchar({ length: 100 }),
    shippedAt: utcDateTime(),
    deliveredAt: utcDateTime(),
    doaCaseId: varchar({ length: 100 }),
    createdAt: utcDateTime().notNull(),
  },
  (t) => [
    index('fulfillment_items_order_idx').on(t.orderId),
    index('fulfillment_items_serial_idx').on(t.serialNumber),
  ],
);
