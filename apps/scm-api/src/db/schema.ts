import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  unique,
  varchar,
  type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';

import type { PurchaseOrderStatus } from '@repo/contracts/procurement';
import type {
  DeviceRequestItemResult,
  DeviceRequestType,
  LocationPolicy,
  LocationType,
  StockMovementReason,
  StockStatus,
  TrackingMode,
  UnitEventType,
  UnitReceiptTrigger,
  UnitStatus,
} from '@repo/contracts/scm';
import type { ShipmentMode } from '@repo/contracts/transport';
import { idColumn, utcDateTime } from '@repo/db-kit/columns';
import { outboxEvents } from '@repo/db-kit/outbox';
import { publicIdColumn, publicIdCounters } from '@repo/db-kit/public-id';

import type { PurchaseOrderSnapshot } from '../domains/procurement/domain/purchase-order.js';
import type { ShipmentAnomaly, ShipmentLink } from '../domains/transport/domain/shipment.js';

export { outboxEvents, publicIdCounters };

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

/**
 * 시리얼 없는(LOT·NONE) 제품의 수량 이동. 추가만 하고 수정·삭제하지 않는다.
 * 재고 = 거점·로트·재고 상태별로 (들어온 합) - (나간 합). 한쪽 거점이 비면 입고 또는 출고·폐기다.
 * 정정은 반대 방향의 이동을 추가하는 역분개이고, 이동 하나는 한 번만 역분개할 수 있다.
 */
export const stockMovements = mysqlTable(
  'stock_movements',
  {
    id: idColumn().primaryKey(),
    productId: idColumn()
      .notNull()
      .references(() => products.id),
    lotNo: varchar({ length: 100 }),
    fromLocationId: idColumn().references(() => locations.id),
    toLocationId: idColumn().references(() => locations.id),
    quantity: int().notNull(),
    stockStatus: varchar({ length: 16 }).$type<StockStatus>().notNull(),
    reason: varchar({ length: 32 }).$type<StockMovementReason>().notNull(),
    occurredAt: utcDateTime().notNull(),
    recordedAt: utcDateTime().notNull(),
    sourceSystem: varchar({ length: 100 }).notNull(),
    sourceRef: varchar({ length: 200 }),
    idempotencyKey: varchar({ length: 200 }).unique(),
    /** 역분개의 사유와 처리자가 들어가므로 보고 때의 메모보다 길다. */
    note: varchar({ length: 1000 }),
    reversesMovementId: idColumn()
      .unique()
      .references((): AnyMySqlColumn => stockMovements.id),
  },
  (t) => [
    check('stock_movements_quantity_chk', sql`${t.quantity} > 0`),
    check(
      'stock_movements_location_chk',
      sql`${t.fromLocationId} is not null or ${t.toLocationId} is not null`,
    ),
  ],
);

/**
 * 우리가 제조사에 내는 발주서. 사실이 아니라 우리가 만든 문서라 고칠 수 있다.
 * 진행도(받은 수량, 완료 여부)는 저장하지 않고 입고·선적 기록에서 계산한다.
 * 발행(ISSUED) 뒤의 변경은 purchase_order_revisions 에 남는다.
 */
export const purchaseOrders = mysqlTable(
  'purchase_orders',
  {
    id: idColumn().primaryKey(),
    /** 허브가 채번하는 번호(`PO-2026-000001`). */
    poNumber: publicIdColumn().notNull().unique(),
    supplier: varchar({ length: 200 }).notNull(),
    /** 달력 날짜. 시각이 아니므로 시간대 변환을 받지 않게 문자열(`YYYY-MM-DD`)로 다룬다. */
    orderDate: date({ mode: 'string' }).notNull(),
    status: varchar({ length: 16 }).$type<PurchaseOrderStatus>().notNull(),
    currency: varchar({ length: 3 }).notNull(),
    destinationLocationId: idColumn()
      .notNull()
      .references(() => locations.id),
    incoterm: varchar({ length: 8 }),
    incotermPlace: varchar({ length: 100 }),
    supplierOrderRef: varchar({ length: 100 }),
    paymentTerms: varchar({ length: 200 }),
    remarks: varchar({ length: 1000 }),
    createdAt: utcDateTime().notNull(),
    createdBy: varchar({ length: 100 }).notNull(),
    issuedAt: utcDateTime(),
    issuedBy: varchar({ length: 100 }),
  },
  (t) => [index('purchase_orders_recent_idx').on(t.createdAt)],
);

export const purchaseOrderLines = mysqlTable(
  'purchase_order_lines',
  {
    id: idColumn().primaryKey(),
    purchaseOrderId: idColumn()
      .notNull()
      .references(() => purchaseOrders.id),
    lineNo: int().notNull(),
    productId: idColumn()
      .notNull()
      .references(() => products.id),
    orderedQty: int().notNull(),
    requestedDeliveryDate: date({ mode: 'string' }).notNull(),
    /** 1개 기준 단가. 통화는 발주 헤더의 currency. */
    unitPrice: decimal({ precision: 18, scale: 4, mode: 'number' }),
    /** 과납·미납 허용률(%). 비어 있으면 허용 없음(0)으로 계산한다. */
    overTolerancePct: decimal({ precision: 5, scale: 2, mode: 'number' }),
    underTolerancePct: decimal({ precision: 5, scale: 2, mode: 'number' }),
    /** "더 안 들어온다"는 선언(미달 납품). 완료 여부가 아니다 — 완료는 받은 누계에서 계산한다. */
    closed: boolean().notNull(),
    closedAt: utcDateTime(),
    closedBy: varchar({ length: 100 }),
    closeReason: varchar({ length: 500 }),
    /** 개정으로 취소한 줄. 줄 번호는 재사용하지 않으므로 행을 지우지 않는다. */
    cancelled: boolean().notNull(),
  },
  (t) => [
    unique('purchase_order_lines_po_line_uq').on(t.purchaseOrderId, t.lineNo),
    index('purchase_order_lines_product_idx').on(t.productId),
  ],
);

/** 발행 뒤의 변경 이력. 추가만 한다. before·after 는 변경 전후의 상태와 줄 전체다. */
export const purchaseOrderRevisions = mysqlTable(
  'purchase_order_revisions',
  {
    id: idColumn().primaryKey(),
    purchaseOrderId: idColumn()
      .notNull()
      .references(() => purchaseOrders.id),
    revisedAt: utcDateTime().notNull(),
    actor: varchar({ length: 100 }).notNull(),
    reason: varchar({ length: 500 }).notNull(),
    before: json().$type<PurchaseOrderSnapshot>().notNull(),
    after: json().$type<PurchaseOrderSnapshot>().notNull(),
  },
  (t) => [index('purchase_order_revisions_po_idx').on(t.purchaseOrderId, t.revisedAt)],
);

/**
 * 제조사·포워더가 알려 준 한 번의 출하 (B/L·시리얼 목록 제출 한 건). 보고된 사실이라 추가만 하고, 수정·삭제를 제공하지 않는다.
 * 보고된 값(reported_po_number, bl_number, 날짜, 줄, 시리얼)은 바뀌지 않는다. 우리가 해석한 값 — purchase_order_id,
 * shipment_no, 줄의 purchase_order_line_id — 만 운영자의 연결 명령(shipment_links)이 한 번 채운다.
 * purchase_order_id 가 null 이면 발주에 연결되지 않은 선적이고 shipment_no 는 `UNLINKED-…`, 연결되면 `<발주 번호>-R<n>` 이다.
 */
export const shipments = mysqlTable(
  'shipments',
  {
    id: idColumn().primaryKey(),
    shipmentNo: varchar({ length: 64 }).notNull().unique(),
    purchaseOrderId: idColumn().references(() => purchaseOrders.id),
    /** 제출된 발주 번호 그대로. 모르는 번호여도 기록한다. */
    reportedPoNumber: varchar({ length: 100 }).notNull(),
    blNumber: varchar({ length: 100 }).notNull(),
    invoiceNumber: varchar({ length: 100 }),
    shipper: varchar({ length: 200 }).notNull(),
    mode: varchar({ length: 8 }).$type<ShipmentMode>().notNull(),
    /** 달력 날짜(`YYYY-MM-DD`). 발주의 날짜와 같이 시각이 아니다. */
    shipDate: date({ mode: 'string' }),
    eta: date({ mode: 'string' }),
    sourceSystem: varchar({ length: 100 }).notNull(),
    sourceRef: varchar({ length: 200 }),
    idempotencyKey: varchar({ length: 200 }).unique(),
    /** 업체가 보고한 시각. */
    reportedAt: utcDateTime().notNull(),
    /** 우리가 기록한 시각. 차수는 이 순서로 매긴다. */
    recordedAt: utcDateTime().notNull(),
    note: varchar({ length: 500 }),
    /** 받을 때 찾은 이상. 바뀌지 않는다. 연결로 해소된 것은 읽을 때 걸러 낸다. */
    anomalies: json().$type<ShipmentAnomaly[]>().notNull(),
  },
  (t) => [index('shipments_po_idx').on(t.purchaseOrderId)],
);

export const shipmentLines = mysqlTable(
  'shipment_lines',
  {
    id: idColumn().primaryKey(),
    shipmentId: idColumn()
      .notNull()
      .references(() => shipments.id),
    /** 1부터. 제출한 순서. */
    lineNo: int().notNull(),
    /** 맞춘 발주 줄. 받을 때 맞지 않았거나 발주에 연결되지 않았으면 null 이고, 연결 명령이 채운다. */
    purchaseOrderLineId: idColumn().references(() => purchaseOrderLines.id),
    productId: idColumn()
      .notNull()
      .references(() => products.id),
    shippedQty: int().notNull(),
    lotNo: varchar({ length: 100 }),
  },
  (t) => [
    unique('shipment_lines_shipment_line_uq').on(t.shipmentId, t.lineNo),
    index('shipment_lines_po_line_idx').on(t.purchaseOrderLineId),
    check('shipment_lines_qty_chk', sql`${t.shippedQty} > 0`),
  ],
);

/** 선적 줄의 시리얼 목록. 입고 검수 때 대조하는 기준이다. */
export const shipmentLineSerials = mysqlTable(
  'shipment_line_serials',
  {
    id: idColumn().primaryKey(),
    shipmentLineId: idColumn()
      .notNull()
      .references(() => shipmentLines.id),
    serialNumber: varchar({ length: 100 }).notNull(),
  },
  (t) => [
    unique('shipment_line_serials_line_serial_uq').on(t.shipmentLineId, t.serialNumber),
    index('shipment_line_serials_serial_idx').on(t.serialNumber),
  ],
);

/** 운영자가 발주에 연결하지 않은 선적을 발주에 연결한 기록. 추가만 하고 선적 하나에 하나뿐이다. */
export const shipmentLinks = mysqlTable(
  'shipment_links',
  {
    id: idColumn().primaryKey(),
    shipmentId: idColumn()
      .notNull()
      .unique()
      .references(() => shipments.id),
    purchaseOrderId: idColumn()
      .notNull()
      .references(() => purchaseOrders.id),
    /** 연결 전 번호(`UNLINKED-…`). 이 번호로도 선적을 찾을 수 있다 (제품 이력의 출처 참조에 남아 있다). */
    previousShipmentNo: varchar({ length: 64 }).notNull().unique(),
    shipmentNo: varchar({ length: 64 }).notNull(),
    actor: varchar({ length: 100 }).notNull(),
    reason: varchar({ length: 500 }).notNull(),
    linkedAt: utcDateTime().notNull(),
    lineLinks: json().$type<ShipmentLink['lineLinks']>().notNull(),
    anomalies: json().$type<ShipmentAnomaly[]>().notNull(),
  },
  (t) => [index('shipment_links_po_idx').on(t.purchaseOrderId)],
);

/**
 * 선적의 무효화 기록. 추가만 하고 선적 하나에 하나뿐이다(`shipment_id` unique).
 * 보고된 선적은 고치거나 지우지 않는다. 틀렸으면 선적 전체를 무효화하고 새 선적으로 다시 제출한다(줄 단위 정정은 없다).
 * 무효 선적은 선적 수량 누계와 "이미 알려진 시리얼" 조회에서 빠지지만, 차수 번호를 셀 때는 계속 센다.
 */
export const shipmentCorrections = mysqlTable('shipment_corrections', {
  id: idColumn().primaryKey(),
  shipmentId: idColumn()
    .notNull()
    .unique()
    .references(() => shipments.id),
  reason: varchar({ length: 500 }).notNull(),
  actor: varchar({ length: 100 }).notNull(),
  recordedAt: utcDateTime().notNull(),
});
