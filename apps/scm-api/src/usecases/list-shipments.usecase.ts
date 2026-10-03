import { Injectable } from '@nestjs/common';

import type { ShipmentListQuery, ShipmentSummaryView } from '@repo/contracts/transport';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { loadShipmentViewContext, toShipmentSummaryView } from './shipment-view.js';

const RECENT = 50;

/**
 * 운영 화면용: 최근 선적 50건 (도착 순서의 역순).
 * `poNumber` 는 그 발주에 연결된 선적만, `unlinked` 는 아직 발주에 연결되지 않은 선적만 고른다.
 * 모르는 발주 번호로 거르면 빈 목록이다 (그 번호에 연결된 선적은 있을 수 없다).
 */
@Injectable()
export class ListShipmentsUsecase {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
  ) {}

  async execute({ poNumber, unlinked }: ShipmentListQuery): Promise<ShipmentSummaryView[]> {
    let purchaseOrderId: string | undefined;
    if (poNumber !== undefined) {
      purchaseOrderId = (await this.purchaseOrders.idsOf([poNumber])).get(poNumber);
      if (purchaseOrderId === undefined) return [];
    }

    const details = await this.shipments.list(
      { purchaseOrderId, unlinkedOnly: unlinked === true },
      RECENT,
    );
    const context = await loadShipmentViewContext(this.catalog, this.purchaseOrders, details);
    return details.map((detail) => toShipmentSummaryView(detail, context));
  }
}
