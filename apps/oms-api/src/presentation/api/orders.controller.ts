import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { IngestOrderRequest, type OrderView } from '@repo/contracts/oms';
import { zod } from '@repo/nest-kit/zod.pipe';

import { GetOrderUsecase } from '../../usecases/get-order.usecase.js';
import { IngestOrderUsecase } from '../../usecases/ingest-order.usecase.js';
import { ListOrdersUsecase } from '../../usecases/list-orders.usecase.js';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ingestOrder: IngestOrderUsecase,
    private readonly listOrders: ListOrdersUsecase,
    private readonly getOrder: GetOrderUsecase,
  ) {}

  /** 판매 채널(또는 채널 연동 어댑터)이 주문을 넘기는 입구. */
  @Post()
  ingest(@Body(zod(IngestOrderRequest)) body: IngestOrderRequest) {
    return this.ingestOrder.execute(body);
  }

  @Get()
  list(): Promise<OrderView[]> {
    return this.listOrders.execute();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<OrderView> {
    return this.getOrder.execute(id);
  }
}
