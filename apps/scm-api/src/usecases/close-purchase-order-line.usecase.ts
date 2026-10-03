import { Inject, Injectable } from '@nestjs/common';

import type { ClosePurchaseOrderLineRequest, PurchaseOrderView } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { noReceiptsYet } from '../domains/procurement/domain/received-quantity.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';

/** 줄을 닫는다: 덜 왔는데 "더 안 들어온다"는 선언 (미달 납품). 이미 닫은 줄은 PO_LINE_ALREADY_CLOSED. */
@Injectable()
export class ClosePurchaseOrderLineUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  execute(
    poNumber: string,
    lineNo: number,
    { reason, actor }: ClosePurchaseOrderLineRequest,
  ): Promise<PurchaseOrderView> {
    return this.tx.run(async () => {
      await this.purchaseOrders.closeLine(poNumber, lineNo, { reason, actor }, noReceiptsYet);
      return this.getPurchaseOrder.execute(poNumber);
    });
  }
}
