import { Injectable } from '@nestjs/common';

import type { OrderView } from '@repo/contracts/oms';

import { OrderService } from '../domains/order/application/order.service.js';
import { toOrderView } from './order-view.js';

@Injectable()
export class ListOrdersUsecase {
  constructor(private readonly orders: OrderService) {}

  async execute(): Promise<OrderView[]> {
    return (await this.orders.listRecent()).map(toOrderView);
  }
}
