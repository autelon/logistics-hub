import { index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import type { LocationType, UnitEventType, UnitStatus } from '@repo/contracts/scm';
import { idColumn, utcDateTime } from '@repo/db-kit/columns';
import { outboxEvents } from '@repo/db-kit/outbox';

export { outboxEvents };

export const products = mysqlTable('products', {
  sku: varchar({ length: 64 }).primaryKey(),
  name: varchar({ length: 200 }).notNull(),
  createdAt: utcDateTime().notNull(),
});

/** 재고가 물리적으로 있을 수 있는 곳. 운영 주체는 외부 업체다. */
export const locations = mysqlTable('locations', {
  code: varchar({ length: 64 }).primaryKey(),
  name: varchar({ length: 200 }).notNull(),
  type: varchar({ length: 32 }).$type<LocationType>().notNull(),
  partner: varchar({ length: 100 }).notNull(),
  createdAt: utcDateTime().notNull(),
});

/**
 * 물리 제품 한 개. status 이하의 컬럼은 unit_events 를 접어서 만든 "현재 상태" 캐시이며
 * 원본이 아니다. 언제든 유효한 사실들로부터 다시 계산할 수 있다.
 */
export const units = mysqlTable(
  'units',
  {
    id: idColumn().primaryKey(),
    serialNumber: varchar({ length: 100 }).notNull().unique(),
    sku: varchar({ length: 64 })
      .notNull()
      .references(() => products.sku),
    status: varchar({ length: 32 }).$type<UnitStatus>().notNull(),
    locationCode: varchar({ length: 64 }).references(() => locations.code),
    orderId: varchar({ length: 100 }),
    fulfillmentItemId: varchar({ length: 100 }),
    anomalies: json().$type<string[]>().notNull(),
    createdAt: utcDateTime().notNull(),
    updatedAt: utcDateTime().notNull(),
  },
  (t) => [index('units_stock_idx').on(t.sku, t.locationCode, t.status)],
);

/**
 * 물리 제품에 일어난 사실. 추가만 하고 수정·삭제하지 않는다.
 * occurredAt 은 현실에서 일어난 시각, recordedAt 은 우리가 알게 된 시각이다.
 */
export const unitEvents = mysqlTable(
  'unit_events',
  {
    id: idColumn().primaryKey(),
    unitId: idColumn()
      .notNull()
      .references(() => units.id),
    type: varchar({ length: 32 }).$type<UnitEventType>().notNull(),
    occurredAt: utcDateTime().notNull(),
    recordedAt: utcDateTime().notNull(),
    locationCode: varchar({ length: 64 }).references(() => locations.code),
    orderId: varchar({ length: 100 }),
    fulfillmentItemId: varchar({ length: 100 }),
    caseId: varchar({ length: 100 }),
    sourceSystem: varchar({ length: 100 }).notNull(),
    sourceRef: varchar({ length: 200 }),
    idempotencyKey: varchar({ length: 200 }).unique(),
    note: varchar({ length: 500 }),
  },
  (t) => [index('unit_events_unit_idx').on(t.unitId, t.occurredAt)],
);

/**
 * 정정 기록. target 사실은 무효가 되고, replacement 가 있으면 그것이 대신 유효해진다.
 * 업체 시스템의 원본 보고는 지워지지 않고 "누가, 왜 바로잡았는지"와 함께 남는다.
 */
export const unitEventCorrections = mysqlTable('unit_event_corrections', {
  id: idColumn().primaryKey(),
  targetEventId: idColumn()
    .notNull()
    .unique()
    .references(() => unitEvents.id),
  replacementEventId: idColumn().references(() => unitEvents.id),
  reason: varchar({ length: 500 }).notNull(),
  actor: varchar({ length: 100 }).notNull(),
  recordedAt: utcDateTime().notNull(),
});
