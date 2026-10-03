import { Injectable } from '@nestjs/common';

import type { PurchaseOrderRevisionView } from '@repo/contracts/procurement';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { toRevisionView } from './procurement-view.js';

/** 발행 뒤의 변경 이력. 최신순 50건. */
@Injectable()
export class ListPurchaseOrderRevisionsUsecase {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly catalog: CatalogService,
  ) {}

  async execute(poNumber: string): Promise<PurchaseOrderRevisionView[]> {
    const revisions = await this.purchaseOrders.listRevisions(poNumber);
    const productIds = revisions.flatMap(({ before, after }) =>
      [...before.lines, ...after.lines].map((line) => line.productId),
    );
    const products = await this.catalog.productsOf(productIds);
    return revisions.map((revision) => toRevisionView(revision, products));
  }
}
