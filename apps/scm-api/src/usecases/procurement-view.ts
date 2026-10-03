import type {
  PurchaseOrderLineInput,
  PurchaseOrderLineView,
  PurchaseOrderRevisionView,
  PurchaseOrderSnapshotView,
  PurchaseOrderSummaryView,
  PurchaseOrderView,
} from '@repo/contracts/procurement';

import type { Product } from '../domains/catalog/domain/catalog.js';
import { lineProgress } from '../domains/procurement/domain/purchase-order-completion.js';
import type {
  PurchaseOrderDetail,
  PurchaseOrderLine,
  PurchaseOrderLineDraft,
  PurchaseOrderRevision,
  PurchaseOrderSnapshot,
  ReceivedQuantities,
} from '../domains/procurement/domain/purchase-order.js';
import { scmError } from '../errors.js';

/** 요청의 줄(sku)을 해석한 제품으로 도메인의 줄 초안(product id)으로 바꾼다. 모르는 SKU 는 UNKNOWN_SKU 로 거절한다. */
export const toLineDrafts = (
  lines: readonly PurchaseOrderLineInput[],
  products: ReadonlyMap<string, Product>,
): PurchaseOrderLineDraft[] =>
  lines.map(({ sku, ...rest }) => {
    const product = products.get(sku);
    if (!product) throw scmError('UNKNOWN_SKU', `Unknown sku ${sku}`);
    return { ...rest, productId: product.id };
  });

/** 응답에 sku 를 싣기 위해 제품 id → sku. 없으면 데이터 무결성이 깨진 것이다. */
const skuOf = (products: ReadonlyMap<string, Product>, productId: string): string => {
  const product = products.get(productId);
  if (!product)
    throw new Error(`Product ${productId} referenced by a purchase order does not exist`);
  return product.sku;
};

/** 발주가 가리키는 거점의 코드. 없으면 데이터 무결성이 깨진 것이다. */
export const requireLocationCode = (
  code: string | null | undefined,
  locationId: string,
): string => {
  if (code === null || code === undefined)
    throw new Error(`Location ${locationId} referenced by a purchase order does not exist`);
  return code;
};

const toLineView = (
  line: PurchaseOrderLine,
  orderCancelled: boolean,
  products: ReadonlyMap<string, Product>,
  received: ReceivedQuantities,
): PurchaseOrderLineView => {
  // 취소된 발주의 줄은 더 기다리지 않는다: 줄을 따로 취소하지 않았어도 CANCELLED 로 계산한다.
  const progress = lineProgress(
    { ...line, cancelled: line.cancelled || orderCancelled },
    received.get(line.id) ?? 0,
  );
  return {
    lineNo: line.lineNo,
    sku: skuOf(products, line.productId),
    orderedQty: line.orderedQty,
    requestedDeliveryDate: line.requestedDeliveryDate,
    unitPrice: line.unitPrice,
    overTolerancePct: line.overTolerancePct,
    underTolerancePct: line.underTolerancePct,
    receivedQty: progress.receivedQty,
    openQty: progress.openQty,
    completion: progress.completion,
    closed: line.closed,
    closedAt: line.closedAt?.toISOString() ?? null,
    closedBy: line.closedBy,
    closeReason: line.closeReason,
    cancelled: line.cancelled,
  };
};

export const toPurchaseOrderView = (
  { order, lines }: PurchaseOrderDetail,
  destinationLocationCode: string,
  products: ReadonlyMap<string, Product>,
  received: ReceivedQuantities,
): PurchaseOrderView => ({
  poNumber: order.poNumber,
  supplier: order.supplier,
  orderDate: order.orderDate,
  status: order.status,
  currency: order.currency,
  destinationLocationCode,
  incoterm: order.incoterm,
  incotermPlace: order.incotermPlace,
  supplierOrderRef: order.supplierOrderRef,
  paymentTerms: order.paymentTerms,
  remarks: order.remarks,
  createdAt: order.createdAt.toISOString(),
  createdBy: order.createdBy,
  issuedAt: order.issuedAt?.toISOString() ?? null,
  issuedBy: order.issuedBy,
  lines: lines.map((line) => toLineView(line, order.status === 'CANCELLED', products, received)),
});

export const toPurchaseOrderSummaryView = (
  { order, lines }: PurchaseOrderDetail,
  destinationLocationCode: string,
): PurchaseOrderSummaryView => {
  const active = lines.filter((line) => !line.cancelled);
  return {
    poNumber: order.poNumber,
    supplier: order.supplier,
    orderDate: order.orderDate,
    status: order.status,
    currency: order.currency,
    destinationLocationCode,
    lineCount: active.length,
    orderedQty: active.reduce((sum, line) => sum + line.orderedQty, 0),
  };
};

const toSnapshotView = (
  { status, lines }: PurchaseOrderSnapshot,
  products: ReadonlyMap<string, Product>,
): PurchaseOrderSnapshotView => ({
  status,
  lines: lines.map(({ productId, ...line }) => ({ ...line, sku: skuOf(products, productId) })),
});

export const toRevisionView = (
  { id, revisedAt, actor, reason, before, after }: PurchaseOrderRevision,
  products: ReadonlyMap<string, Product>,
): PurchaseOrderRevisionView => ({
  id,
  revisedAt: revisedAt.toISOString(),
  actor,
  reason,
  before: toSnapshotView(before, products),
  after: toSnapshotView(after, products),
});
