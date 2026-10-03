import { Module } from '@nestjs/common';

import { serviceConfigModule } from '@repo/nest-kit/config';
import { InfraModule } from '@repo/nest-kit/infra.module';
import { LoggerModule } from '@repo/nest-kit/logger.module';

import * as schema from './db/schema.js';
import { ApiModule } from './presentation/api/api.module.js';
import { ConsumerModule } from './presentation/consumer/consumer.module.js';

@Module({
  imports: [
    serviceConfigModule({
      defaults: { PORT: 3001, DATABASE_URL: 'mysql://root:root@localhost:3306/lh_scm' },
    }),
    LoggerModule,
    InfraModule.forRoot({ schema }),
    ApiModule,
    ConsumerModule,
  ],
})
export class AppModule {}
