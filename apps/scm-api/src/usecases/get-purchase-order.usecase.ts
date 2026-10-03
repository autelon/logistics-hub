import { Injectable } from '@nestjs/common';

import type { PurchaseOrderView } from '@repo/contracts/procurement';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { noReceiptsYet } from '../domains/procurement/domain/received-quantity.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { requireLocationCode, toPurchaseOrderView } from './procurement-view.js';

/**
 * 발주 한 건과 줄별 진행 상태(받은 수량, 열린 수량, 완료 상태)와 선적 누계.
 * 받은 수량은 아직 입고가 없어 `noReceiptsYet` 로 항상 0 이다 (그 파일의 TODO 참고). 완료 상태는 받은 수량으로 계산하고,
 * 선적 누계(`shippedQty`, 연결된 선적 줄의 합)는 따로 보여 줄 뿐 완료 계산에 쓰지 않는다.
 */
@Injectable()
export class GetPurchaseOrderUsecase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
    private readonly shipments: ShipmentService,
  ) {}

  async execute(poNumber: string): Promise<PurchaseOrderView> {
    const detail = await this.purchaseOrders.get(poNumber);
    const [products, locationCode, received, shipped] = await Promise.all([
      this.catalog.productsOf(detail.lines.map((line) => line.productId)),
      this.catalog.locationCodeOf(detail.order.destinationLocationId),
      noReceiptsYet(detail.lines.map((line) => line.id)),
      this.shipments.shippedQuantities(detail.lines.map((line) => line.id)),
    ]);
    return toPurchaseOrderView(
      detail,
      requireLocationCode(locationCode, detail.order.destinationLocationId),
      products,
      received,
      shipped,
    );
  }
}
