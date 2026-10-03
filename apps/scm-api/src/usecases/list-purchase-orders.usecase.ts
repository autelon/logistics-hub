import { Injectable } from '@nestjs/common';

import type { PurchaseOrderSummaryView } from '@repo/contracts/procurement';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { requireLocationCode, toPurchaseOrderSummaryView } from './procurement-view.js';

const RECENT = 50;

/** 운영 화면용: 최근 발주 50건. */
@Injectable()
export class ListPurchaseOrdersUsecase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
  ) {}

  async execute(): Promise<PurchaseOrderSummaryView[]> {
    const [details, locations] = await Promise.all([
      this.purchaseOrders.list(RECENT),
      this.catalog.listLocations(),
    ]);
    const codes = new Map(locations.map((location) => [location.id, location.code]));
    return details.map((detail) =>
      toPurchaseOrderSummaryView(
        detail,
        requireLocationCode(
          codes.get(detail.order.destinationLocationId),
          detail.order.destinationLocationId,
        ),
      ),
    );
  }
}
