import { Module } from '@nestjs/common';

import { UnitService } from './application/unit.service.js';
import { UnitRepository } from './domain/unit.repository.js';
import { DrizzleUnitRepository } from './infra/drizzle-unit.repository.js';

@Module({
  providers: [UnitService, { provide: UnitRepository, useClass: DrizzleUnitRepository }],
  exports: [UnitService],
})
export class UnitModule {}
