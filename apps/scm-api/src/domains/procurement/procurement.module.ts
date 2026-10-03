import { Module } from '@nestjs/common';

import { PurchaseOrderService } from './application/purchase-order.service.js';
import { PurchaseOrderRepository } from './domain/purchase-order.repository.js';
import { DrizzlePurchaseOrderRepository } from './infra/drizzle-purchase-order.repository.js';

@Module({
  providers: [
    PurchaseOrderService,
    { provide: PurchaseOrderRepository, useClass: DrizzlePurchaseOrderRepository },
  ],
  exports: [PurchaseOrderService],
})
export class ProcurementModule {}
