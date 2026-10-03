import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { CasesController } from './cases.controller.js';

@Module({
  imports: [UsecasesModule],
  controllers: [HealthController, CasesController],
})
export class ApiModule {}
