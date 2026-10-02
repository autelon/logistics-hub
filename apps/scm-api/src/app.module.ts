import { Module } from '@nestjs/common';

import { serviceConfigModule } from '@repo/nest-kit/config';
import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';

import { CatalogController } from './catalog/catalog.controller.js';
import * as schema from './db/schema.js';
import { AsEventsConsumer } from './integration/as-events.consumer.js';
import { UnitsController } from './units/units.controller.js';
import { UnitsService } from './units/units.service.js';

@Module({
  imports: [
    serviceConfigModule({
      defaults: { PORT: 3001, DATABASE_URL: 'mysql://root:root@localhost:3306/lh_scm' },
    }),
    InfraModule.forRoot({ schema }),
  ],
  controllers: [HealthController, CatalogController, UnitsController],
  providers: [UnitsService, AsEventsConsumer],
})
export class AppModule {}
