import { Module } from '@nestjs/common';

import { WarehouseService } from './application/warehouse.service.js';
import { StockMovementRepository } from './domain/stock-movement.repository.js';
import { DrizzleStockMovementRepository } from './infra/drizzle-stock-movement.repository.js';

@Module({
  providers: [
    WarehouseService,
    { provide: StockMovementRepository, useClass: DrizzleStockMovementRepository },
  ],
  exports: [WarehouseService],
})
export class WarehouseModule {}
