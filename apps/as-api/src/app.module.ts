import { Module } from '@nestjs/common';

import { serviceConfigModule } from '@repo/nest-kit/config';
import { HealthController } from '@repo/nest-kit/health.controller';
import { InfraModule } from '@repo/nest-kit/infra.module';
import { LoggerModule } from '@repo/nest-kit/logger.module';

import { CasesController } from './cases/cases.controller.js';
import { CasesService } from './cases/cases.service.js';
import * as schema from './db/schema.js';

@Module({
  imports: [
    serviceConfigModule({
      defaults: { PORT: 3003, DATABASE_URL: 'mysql://root:root@localhost:3306/lh_as' },
    }),
    LoggerModule,
    InfraModule.forRoot({ schema }),
  ],
  controllers: [HealthController, CasesController],
  providers: [CasesService],
})
export class AppModule {}
