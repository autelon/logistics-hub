import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';

import { CatalogController } from './catalog/catalog.controller.js';
import * as schema from './db/schema.js';
import { env } from './env.js';
import { AsEventsConsumer } from './integration/as-events.consumer.js';
import { UnitsController } from './units/units.controller.js';
import { UnitsService } from './units/units.service.js';

@Module({
  imports: [
    InfraModule.forRoot({ databaseUrl: env.DATABASE_URL, schema, redisUrl: env.REDIS_URL }),
  ],
  controllers: [HealthController, CatalogController, UnitsController],
  providers: [UnitsService, AsEventsConsumer],
})
export class AppModule {}
