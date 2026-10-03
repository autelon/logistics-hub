import { Injectable } from '@nestjs/common';

import type { PurchaseOrderView } from '@repo/contracts/procurement';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { noReceiptsYet } from '../domains/procurement/domain/received-quantity.js';
import { requireLocationCode, toPurchaseOrderView } from './procurement-view.js';

/**
 * 발주 한 건과 줄별 진행 상태(받은 수량, 열린 수량, 완료 상태).
 * 받은 수량은 아직 입고·선적이 없어 `noReceiptsYet` 로 항상 0 이다 (그 파일의 TODO 참고).
 */
@Injectable()
export class GetPurchaseOrderUsecase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
  ) {}

  async execute(poNumber: string): Promise<PurchaseOrderView> {
    const detail = await this.purchaseOrders.get(poNumber);
    const [products, locationCode, received] = await Promise.all([
      this.catalog.productsOf(detail.lines.map((line) => line.productId)),
      this.catalog.locationCodeOf(detail.order.destinationLocationId),
      noReceiptsYet(detail.lines.map((line) => line.id)),
    ]);
    return toPurchaseOrderView(
      detail,
      requireLocationCode(locationCode, detail.order.destinationLocationId),
      products,
      received,
    );
  }
}
