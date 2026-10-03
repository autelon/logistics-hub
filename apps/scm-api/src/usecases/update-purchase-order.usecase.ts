import { Inject, Injectable } from '@nestjs/common';

import type { PurchaseOrderView, UpdatePurchaseOrderRequest } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';
import { toLineDrafts } from './procurement-view.js';

/** 초안(DRAFT)을 통째로 바꾼다. 초안이 아니면 PO_NOT_DRAFT. */
@Injectable()
export class UpdatePurchaseOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  async execute(
    poNumber: string,
    { lines, destinationLocationCode, ...fields }: UpdatePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    // 기준 정보는 바뀌지 않는 id 라 트랜잭션 밖에서 해석한다. 트랜잭션은 발주 행 잠금으로 시작해야 한다
    // (그 전에 다른 읽기를 하면 스냅샷이 잠금보다 먼저 잡혀 앞선 변경을 못 본다).
    const location = await this.catalog.locationByCode(destinationLocationCode);
    const drafts = toLineDrafts(
      lines,
      await this.catalog.productsBySku(lines.map((line) => line.sku)),
    );
    return this.tx.run(async () => {
      await this.purchaseOrders.replaceDraft(
        poNumber,
        { ...fields, destinationLocationId: location.id },
        drafts,
      );
      return this.getPurchaseOrder.execute(poNumber);
    });
  }
}
