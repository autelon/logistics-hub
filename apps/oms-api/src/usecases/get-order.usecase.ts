import { Injectable } from '@nestjs/common';

import type { OrderView } from '@repo/contracts/oms';

import { OrderService } from '../domains/order/application/order.service.js';
import { toOrderView } from './order-view.js';

@Injectable()
export class GetOrderUsecase {
  constructor(private readonly orders: OrderService) {}

  async execute(orderId: string): Promise<OrderView> {
    return toOrderView(await this.orders.get(orderId));
  }
}
