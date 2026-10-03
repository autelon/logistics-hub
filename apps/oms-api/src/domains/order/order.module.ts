import { Module } from '@nestjs/common';

import { OrderService } from './application/order.service.js';
import { OrderRepository } from './domain/order.repository.js';
import { DrizzleOrderRepository } from './infra/drizzle-order.repository.js';

@Module({
  providers: [OrderService, { provide: OrderRepository, useClass: DrizzleOrderRepository }],
  exports: [OrderService],
})
export class OrderModule {}
