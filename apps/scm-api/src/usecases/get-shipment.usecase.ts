import { Injectable } from '@nestjs/common';

import type { ShipmentDetailView } from '@repo/contracts/transport';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { loadShipmentViewContext, toShipmentDetailView } from './shipment-view.js';

/**
 * 선적 한 건: 줄(시리얼 수 포함), 지금 유효한 이상, 연결된 발주, 연결 기록.
 * 현재 번호(`<발주 번호>-R<n>`)로도, 연결하기 전 번호(`UNLINKED-…`)로도 찾는다.
 */
@Injectable()
export class GetShipmentUsecase {
  constructor(
    private readonly shipments: ShipmentService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
  ) {}

  async execute(shipmentNo: string): Promise<ShipmentDetailView> {
    const detail = await this.shipments.get(shipmentNo);
    const context = await loadShipmentViewContext(this.catalog, this.purchaseOrders, [detail]);
    return toShipmentDetailView(detail, context);
  }
}
