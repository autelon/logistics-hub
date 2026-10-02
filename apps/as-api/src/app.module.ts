import { Module } from '@nestjs/common';

import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';

import { CasesController } from './cases/cases.controller.js';
import { CasesService } from './cases/cases.service.js';
import * as schema from './db/schema.js';
import { env } from './env.js';

@Module({
  imports: [
    InfraModule.forRoot({ databaseUrl: env.DATABASE_URL, schema, redisUrl: env.REDIS_URL }),
  ],
  controllers: [HealthController, CasesController],
  providers: [CasesService],
})
export class AppModule {}
