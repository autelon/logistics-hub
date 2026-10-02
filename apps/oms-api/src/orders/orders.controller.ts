import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { IngestOrderRequest } from '@repo/contracts/oms';
import { zod } from '@repo/nest-kit/zod.pipe';

import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** 판매 채널(또는 채널 연동 어댑터)이 주문을 넘기는 입구. */
  @Post()
  ingest(@Body(zod(IngestOrderRequest)) body: IngestOrderRequest) {
    return this.orders.ingest(body);
  }

  @Get()
  list() {
    return this.orders.listRecent();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }
}
