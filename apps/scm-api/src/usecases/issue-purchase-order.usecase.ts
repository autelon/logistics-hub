import { Inject, Injectable } from '@nestjs/common';

import type { IssuePurchaseOrderRequest, PurchaseOrderView } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';

/** 초안을 발행한다 (DRAFT → ISSUED). 초안이 아니면 PO_NOT_DRAFT. */
@Injectable()
export class IssuePurchaseOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  execute(poNumber: string, { actor }: IssuePurchaseOrderRequest): Promise<PurchaseOrderView> {
    return this.tx.run(async () => {
      await this.purchaseOrders.issue(poNumber, actor);
      return this.getPurchaseOrder.execute(poNumber);
    });
  }
}
