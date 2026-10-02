import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';

import * as schema from './db/schema.js';
import { env } from './env.js';
import { EventsConsumer } from './integration/events.consumer.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { SellablesController } from './sellables/sellables.controller.js';

@Module({
  imports: [
    InfraModule.forRoot({ databaseUrl: env.DATABASE_URL, schema, redisUrl: env.REDIS_URL }),
  ],
  controllers: [HealthController, SellablesController, OrdersController],
  providers: [OrdersService, EventsConsumer],
})
export class AppModule {}
