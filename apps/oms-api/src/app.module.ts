import { Module } from '@nestjs/common';

import { serviceConfigModule } from '@repo/nest-kit/config';
import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';
import { LoggerModule } from '@repo/nest-kit/logger.module';

import * as schema from './db/schema.js';
import { EventsConsumer } from './integration/events.consumer.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { SellablesController } from './sellables/sellables.controller.js';

@Module({
  imports: [
    serviceConfigModule({
      defaults: { PORT: 3002, DATABASE_URL: 'mysql://root:root@localhost:3306/lh_oms' },
    }),
    LoggerModule,
    InfraModule.forRoot({ schema }),
  ],
  controllers: [HealthController, SellablesController, OrdersController],
  providers: [OrdersService, EventsConsumer],
})
export class AppModule {}
