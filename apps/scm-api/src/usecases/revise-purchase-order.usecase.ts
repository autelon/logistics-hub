import { Inject, Injectable } from '@nestjs/common';

import type { PurchaseOrderView, RevisePurchaseOrderRequest } from '@repo/contracts/procurement';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { noReceiptsYet } from '../domains/procurement/domain/received-quantity.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';
import { toLineDrafts } from './procurement-view.js';

/**
 * 발행된 발주의 줄을 개정한다 (수량·납기·단가·허용률 변경, 줄 추가, 줄 취소). 변경 전후 전체가 이력에 남는다.
 * 받은 수량보다 적게 줄이는 변경은 거절한다 (PO_QTY_BELOW_RECEIVED).
 */
@Injectable()
export class RevisePurchaseOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
  ) {}

  async execute(
    poNumber: string,
    { reason, actor, changes }: RevisePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    // 기준 정보는 트랜잭션 밖에서 해석한다 (UpdatePurchaseOrderUsecase 의 같은 자리 참고).
    const addLines = toLineDrafts(
      changes.addLines,
      await this.catalog.productsBySku(changes.addLines.map((line) => line.sku)),
    );
    return this.tx.run(async () => {
      await this.purchaseOrders.revise(
        poNumber,
        { reason, actor },
        { ...changes, addLines },
        noReceiptsYet,
      );
      return this.getPurchaseOrder.execute(poNumber);
    });
  }
}
