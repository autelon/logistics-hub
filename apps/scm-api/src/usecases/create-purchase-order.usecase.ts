import { Inject, Injectable } from '@nestjs/common';

import type { CreatePurchaseOrderRequest, PurchaseOrderView } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';
import { toLineDrafts } from './procurement-view.js';

/**
 * 발주 초안(DRAFT)을 만든다. 우리가 내리는 명령이라 모르는 거점·SKU 는 거절한다
 * (UNKNOWN_LOCATION, UNKNOWN_SKU).
 */
@Injectable()
export class CreatePurchaseOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  async execute({
    actor,
    lines,
    destinationLocationCode,
    ...fields
  }: CreatePurchaseOrderRequest): Promise<PurchaseOrderView> {
    const location = await this.catalog.locationByCode(destinationLocationCode);
    const drafts = toLineDrafts(
      lines,
      await this.catalog.productsBySku(lines.map((line) => line.sku)),
    );
    return this.tx.run(async () => {
      const { order } = await this.purchaseOrders.create(
        { ...fields, destinationLocationId: location.id },
        drafts,
        actor,
      );
      return this.getPurchaseOrder.execute(order.poNumber);
    });
  }
}
