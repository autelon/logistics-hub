import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { CatalogController } from './catalog.controller.js';
import { UnitsController } from './units.controller.js';

@Module({
  imports: [UsecasesModule],
  controllers: [HealthController, CatalogController, UnitsController],
})
export class ApiModule {}
