import { Inject, Injectable } from '@nestjs/common';

import type { CancelPurchaseOrderRequest, PurchaseOrderView } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { noReceiptsYet } from '../domains/procurement/domain/received-quantity.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';

/** 발주를 취소한다. 받은 것이 있으면 PO_HAS_RECEIPTS. */
@Injectable()
export class CancelPurchaseOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  execute(
    poNumber: string,
    { reason, actor }: CancelPurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.tx.run(async () => {
      await this.purchaseOrders.cancel(poNumber, { reason, actor }, noReceiptsYet);
      return this.getPurchaseOrder.execute(poNumber);
    });
  }
}
