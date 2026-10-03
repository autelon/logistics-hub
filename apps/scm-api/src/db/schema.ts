import { boolean, index, json, mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core';

import type {
  DeviceRequestItemResult,
  DeviceRequestType,
  LocationPolicy,
  LocationType,
  TrackingMode,
  UnitEventType,
  UnitReceiptTrigger,
  UnitStatus,
} from '@repo/contracts/scm';
import { idColumn, utcDateTime } from '@repo/db-kit/columns';
import { outboxEvents } from '@repo/db-kit/outbox';

export { outboxEvents };

export const products = mysqlTable('products', {
  id: idColumn().primaryKey(),
  sku: varchar({ length: 64 }).notNull().unique(),
  name: varchar({ length: 200 }).notNull(),
  /** 추적 방식. SERIAL 만 개체 단위로 추적하고 제품 등록 대상이다. */
  trackingMode: varchar({ length: 16 }).$type<TrackingMode>().notNull().default('SERIAL'),
  createdAt: utcDateTime().notNull(),
});

/** 재고가 물리적으로 있을 수 있는 곳. 운영 주체는 외부 업체다. */
export const locations = mysqlTable('locations', {
  id: idColumn().primaryKey(),
  code: varchar({ length: 64 }).notNull().unique(),
  name: varchar({ length: 200 }).notNull(),
  type: varchar({ length: 32 }).$type<LocationType>().notNull(),
  partner: varchar({ length: 100 }).notNull(),
  createdAt: utcDateTime().notNull(),
});

/**
 * 거점의 능력 프로필(1:1). 행이 없으면 기본값으로 동작하므로 거점마다 있어야 하는 것은 아니다.
 * 기본값은 DB 가 아니라 도메인(resolvePolicy)이 정한다. 행은 처음 바꿀 때 모든 값을 채워 만든다.
 */
export const locationPolicies = mysqlTable('location_policies', {
  id: idColumn().primaryKey(),
  locationId: idColumn()
    .notNull()
    .unique()
    .references(() => locations.id),
  reportsSerialsOnReceipt: boolean().notNull(),
  reportsSerialsOnShipment: boolean().notNull(),
  reportsSerialsOnOutbound: boolean().notNull(),
  reportsInspectionResult: boolean().notNull(),
  decidesDisposition: boolean().notNull(),
  requiresHubConfirmation: boolean().notNull(),
  unitReceiptTrigger: varchar({ length: 32 }).$type<UnitReceiptTrigger>().notNull(),
  autoRegisterOnPutaway: boolean().notNull(),
  updatedAt: utcDateTime().notNull(),
  updatedBy: varchar({ length: 100 }).notNull(),
});

/** 능력 프로필 변경 이력. 추가만 한다. before·after 는 기본값이 채워진 전체 값이다. */
export const locationPolicyChanges = mysqlTable(
  'location_policy_changes',
  {
    id: idColumn().primaryKey(),
    locationId: idColumn()
      .notNull()
      .references(() => locations.id),
    actor: varchar({ length: 100 }).notNull(),
    changedAt: utcDateTime().notNull(),
    before: json().$type<LocationPolicy>().notNull(),
    after: json().$type<LocationPolicy>().notNull(),
  },
  (t) => [index('location_policy_changes_location_idx').on(t.locationId, t.changedAt)],
);

/**
 * 물리 제품 한 개. status 이하의 컬럼은 unit_events 를 접어서 만든 "현재 상태" 캐시이며
 * 원본이 아니다. 언제든 유효한 사실들로부터 다시 계산할 수 있다.
 */
export const units = mysqlTable(
  'units',
  {
    id: idColumn().primaryKey(),
    serialNumber: varchar({ length: 100 }).notNull().unique(),
    productId: idColumn()
      .notNull()
      .references(() => products.id),
    status: varchar({ length: 32 }).$type<UnitStatus>().notNull(),
    locationId: idColumn().references(() => locations.id),
    orderId: varchar({ length: 100 }),
    fulfillmentItemId: varchar({ length: 100 }),
    /** 제품으로 등록된 시각. 유효한 REGISTERED 사실이 없으면 null. 상태 캐시의 일부다. */
    registeredAt: utcDateTime(),
    anomalies: json().$type<string[]>().notNull(),
    createdAt: utcDateTime().notNull(),
    updatedAt: utcDateTime().notNull(),
  },
  (t) => [index('units_stock_idx').on(t.productId, t.locationId, t.status)],
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
    locationId: idColumn().references(() => locations.id),
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

/**
 * 기기 서버에 보내는 요청. 등록(REGISTER)과 비활성화(DEACTIVATE)는 기기 서버에서 서로 다른 처리라 따로 만든다.
 * 상태는 저장하지 않고 notified_at 과 항목별 결과에서 계산한다.
 */
export const deviceRequests = mysqlTable('device_requests', {
  id: idColumn().primaryKey(),
  type: varchar({ length: 16 }).$type<DeviceRequestType>().notNull(),
  /** 요청을 만든 사실의 종류(DOA_CONFIRMED 등) 또는 REGISTRATION, REGISTRATION_VOIDED. */
  reason: varchar({ length: 100 }).notNull(),
  createdBy: varchar({ length: 200 }).notNull(),
  createdAt: utcDateTime().notNull(),
  /** 기기 서버에 알린 시각. 알림이 성공할 때까지 null. */
  notifiedAt: utcDateTime(),
});

/** 요청에 딸린 시리얼. 기기 서버가 id 순서의 커서로 페이지씩 가져가고, 결과도 여기에 시리얼별로 적힌다. */
export const deviceRequestItems = mysqlTable(
  'device_request_items',
  {
    id: idColumn().primaryKey(),
    requestId: idColumn()
      .notNull()
      .references(() => deviceRequests.id),
    unitId: idColumn()
      .notNull()
      .references(() => units.id),
    /** 요청 시점의 시리얼과 SKU. 기기 서버에 그대로 보여 줄 값이라 복사해 둔다. */
    serialNumber: varchar({ length: 100 }).notNull(),
    sku: varchar({ length: 64 }).notNull(),
    result: varchar({ length: 16 }).$type<'PENDING' | DeviceRequestItemResult>().notNull(),
    resultReason: varchar({ length: 500 }),
    resultAt: utcDateTime(),
  },
  (t) => [
    unique('device_request_items_request_unit_uq').on(t.requestId, t.unitId),
    index('device_request_items_page_idx').on(t.requestId, t.id),
    index('device_request_items_serial_idx').on(t.requestId, t.serialNumber),
  ],
);
