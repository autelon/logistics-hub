import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import {
  CancelPurchaseOrderRequest,
  ClosePurchaseOrderLineRequest,
  CreatePurchaseOrderRequest,
  IssuePurchaseOrderRequest,
  PurchaseOrderLineNo,
  RevisePurchaseOrderRequest,
  UpdatePurchaseOrderRequest,
  type PurchaseOrderRevisionView,
  type PurchaseOrderSummaryView,
  type PurchaseOrderView,
} from '@repo/contracts/procurement';
import { zod } from '@repo/nest-kit/zod.pipe';

import { CancelPurchaseOrderUsecase } from '../../usecases/cancel-purchase-order.usecase.js';
import { ClosePurchaseOrderLineUsecase } from '../../usecases/close-purchase-order-line.usecase.js';
import { CreatePurchaseOrderUsecase } from '../../usecases/create-purchase-order.usecase.js';
import { GetPurchaseOrderUsecase } from '../../usecases/get-purchase-order.usecase.js';
import { IssuePurchaseOrderUsecase } from '../../usecases/issue-purchase-order.usecase.js';
import { ListPurchaseOrderRevisionsUsecase } from '../../usecases/list-purchase-order-revisions.usecase.js';
import { ListPurchaseOrdersUsecase } from '../../usecases/list-purchase-orders.usecase.js';
import { RevisePurchaseOrderUsecase } from '../../usecases/revise-purchase-order.usecase.js';
import { UpdatePurchaseOrderUsecase } from '../../usecases/update-purchase-order.usecase.js';

/**
 * 발주. 우리가 내리는 명령이라 전제가 맞지 않으면 에러 코드로 거절한다 (PO_*, UNKNOWN_SKU, UNKNOWN_LOCATION).
 * 초안(DRAFT)은 자유롭게 고치고(PUT), 발행(ISSUED) 뒤의 변경은 개정(revisions)으로 이력을 남긴다.
 */
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly createPurchaseOrder: CreatePurchaseOrderUsecase,
    private readonly updatePurchaseOrder: UpdatePurchaseOrderUsecase,
    private readonly issuePurchaseOrder: IssuePurchaseOrderUsecase,
    private readonly revisePurchaseOrder: RevisePurchaseOrderUsecase,
    private readonly closeLine: ClosePurchaseOrderLineUsecase,
    private readonly cancelPurchaseOrder: CancelPurchaseOrderUsecase,
    private readonly listPurchaseOrders: ListPurchaseOrdersUsecase,
    private readonly getPurchaseOrder: GetPurchaseOrderUsecase,
    private readonly listRevisions: ListPurchaseOrderRevisionsUsecase,
  ) {}

  @Post()
  create(
    @Body(zod(CreatePurchaseOrderRequest)) body: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.createPurchaseOrder.execute(body);
  }

  /** 최근 50건. */
  @Get()
  list(): Promise<PurchaseOrderSummaryView[]> {
    return this.listPurchaseOrders.execute();
  }

  @Get(':poNumber')
  get(@Param('poNumber') poNumber: string): Promise<PurchaseOrderView> {
    return this.getPurchaseOrder.execute(poNumber);
  }

  /** 초안을 통째로 바꾼다. 초안이 아니면 PO_NOT_DRAFT. */
  @Put(':poNumber')
  update(
    @Param('poNumber') poNumber: string,
    @Body(zod(UpdatePurchaseOrderRequest)) body: UpdatePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.updatePurchaseOrder.execute(poNumber, body);
  }

  @Post(':poNumber/issue')
  issue(
    @Param('poNumber') poNumber: string,
    @Body(zod(IssuePurchaseOrderRequest)) body: IssuePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.issuePurchaseOrder.execute(poNumber, body);
  }

  /** 발행 뒤의 변경. 변경 전후 전체가 이력에 남는다. */
  @Post(':poNumber/revisions')
  revise(
    @Param('poNumber') poNumber: string,
    @Body(zod(RevisePurchaseOrderRequest)) body: RevisePurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.revisePurchaseOrder.execute(poNumber, body);
  }

  /** 개정 이력, 최신순 50건. */
  @Get(':poNumber/revisions')
  revisions(@Param('poNumber') poNumber: string): Promise<PurchaseOrderRevisionView[]> {
    return this.listRevisions.execute(poNumber);
  }

  @Post(':poNumber/lines/:lineNo/close')
  close(
    @Param('poNumber') poNumber: string,
    @Param('lineNo', zod(PurchaseOrderLineNo)) lineNo: number,
    @Body(zod(ClosePurchaseOrderLineRequest)) body: ClosePurchaseOrderLineRequest,
  ): Promise<PurchaseOrderView> {
    return this.closeLine.execute(poNumber, lineNo, body);
  }

  @Post(':poNumber/cancel')
  cancel(
    @Param('poNumber') poNumber: string,
    @Body(zod(CancelPurchaseOrderRequest)) body: CancelPurchaseOrderRequest,
  ): Promise<PurchaseOrderView> {
    return this.cancelPurchaseOrder.execute(poNumber, body);
  }
}
