import type { ShipmentDetailView, ShipmentSummaryView } from '@repo/contracts/transport';

import type { CatalogService } from '../domains/catalog/application/catalog.service.js';
import type { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { currentAnomalies } from '../domains/transport/domain/shipment-numbering.js';
import { isVoided } from '../domains/transport/domain/shipment-void.js';
import type { ShipmentDetail } from '../domains/transport/domain/shipment.js';

/** 응답에 싣기 위해 id 를 번호·코드로 바꾸는 표. 선적 도메인은 발주·제품의 코드를 모른다. */
export interface ShipmentViewContext {
  /** 발주 id → 발주 번호. */
  poNumbers: ReadonlyMap<string, string>;
  /** 발주 줄 id → 줄 번호. */
  poLineNos: ReadonlyMap<string, number>;
  /** 제품 id → sku. */
  skus: ReadonlyMap<string, string>;
}

/** 선적들이 가리키는 발주(와 줄)와 제품을 한 번에 읽는다. */
export const loadShipmentViewContext = async (
  catalog: CatalogService,
  purchaseOrders: PurchaseOrderService,
  details: readonly ShipmentDetail[],
): Promise<ShipmentViewContext> => {
  const purchaseOrderIds = details.flatMap(({ shipment, link }) => [
    ...(shipment.purchaseOrderId ? [shipment.purchaseOrderId] : []),
    ...(link ? [link.purchaseOrderId] : []),
  ]);
  const [orders, products] = await Promise.all([
    purchaseOrders.getMany(purchaseOrderIds),
    catalog.productsOf(details.flatMap(({ lines }) => lines.map((line) => line.productId))),
  ]);
  return {
    poNumbers: new Map(orders.map(({ order }) => [order.id, order.poNumber])),
    poLineNos: new Map(orders.flatMap(({ lines }) => lines.map((line) => [line.id, line.lineNo]))),
    skus: new Map([...products.values()].map((product) => [product.id, product.sku])),
  };
};

const required = <T>(value: T | undefined, what: string): T => {
  // 외래 키로 보장되는 값이라 서비스 에러가 아니라 데이터 무결성 문제다.
  if (value === undefined) throw new Error(`${what} referenced by a shipment does not exist`);
  return value;
};

export const toShipmentSummaryView = (
  detail: ShipmentDetail,
  context: ShipmentViewContext,
): ShipmentSummaryView => {
  const { shipment, lines, link } = detail;
  return {
    shipmentNo: shipment.shipmentNo,
    poNumber: shipment.purchaseOrderId
      ? required(context.poNumbers.get(shipment.purchaseOrderId), `Purchase order`)
      : null,
    reportedPoNumber: shipment.reportedPoNumber,
    blNumber: shipment.blNumber,
    invoiceNumber: shipment.invoiceNumber,
    shipper: shipment.shipper,
    mode: shipment.mode,
    shipDate: shipment.shipDate,
    eta: shipment.eta,
    source: shipment.source,
    reportedAt: shipment.reportedAt.toISOString(),
    recordedAt: shipment.recordedAt.toISOString(),
    lineCount: lines.length,
    totalQty: lines.reduce((sum, line) => sum + line.shippedQty, 0),
    serialCount: lines.reduce((sum, line) => sum + line.serialCount, 0),
    anomalyCount: currentAnomalies(shipment.anomalies, link).length,
    voided: isVoided(detail),
  };
};

export const toShipmentDetailView = (
  detail: ShipmentDetail,
  context: ShipmentViewContext,
): ShipmentDetailView => {
  const { shipment, lines, link, correction } = detail;
  return {
    ...toShipmentSummaryView(detail, context),
    note: shipment.note,
    lines: lines.map((line) => ({
      lineNo: line.lineNo,
      sku: required(context.skus.get(line.productId), 'Product'),
      quantity: line.shippedQty,
      lotNo: line.lotNo,
      poLineNo: line.purchaseOrderLineId
        ? required(context.poLineNos.get(line.purchaseOrderLineId), 'Purchase order line')
        : null,
      serialCount: line.serialCount,
    })),
    anomalies: currentAnomalies(shipment.anomalies, link),
    link: link && {
      previousShipmentNo: link.previousShipmentNo,
      poNumber: required(context.poNumbers.get(link.purchaseOrderId), 'Purchase order'),
      actor: link.actor,
      reason: link.reason,
      linkedAt: link.linkedAt.toISOString(),
      anomalies: link.anomalies,
    },
    voidRecord: correction && {
      actor: correction.actor,
      reason: correction.reason,
      voidedAt: correction.recordedAt.toISOString(),
    },
  };
};
