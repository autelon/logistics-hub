import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { OrdersController } from './orders.controller.js';
import { SellablesController } from './sellables.controller.js';

@Module({
  imports: [UsecasesModule],
  controllers: [HealthController, SellablesController, OrdersController],
})
export class ApiModule {}
