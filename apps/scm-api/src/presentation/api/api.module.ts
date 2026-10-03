import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { CatalogController } from './catalog.controller.js';
import { DeviceRequestsController } from './device-requests.controller.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { StockMovementsController } from './stock-movements.controller.js';
import { UnitRegistrationsController } from './unit-registrations.controller.js';
import { UnitsController } from './units.controller.js';

@Module({
  imports: [UsecasesModule],
  controllers: [
    HealthController,
    CatalogController,
    UnitsController,
    UnitRegistrationsController,
    DeviceRequestsController,
    StockMovementsController,
    PurchaseOrdersController,
  ],
})
export class ApiModule {}
