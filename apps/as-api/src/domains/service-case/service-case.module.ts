import { Module } from '@nestjs/common';

import { ServiceCaseService } from './application/service-case.service.js';
import { ServiceCaseRepository } from './domain/service-case.repository.js';
import { DrizzleServiceCaseRepository } from './infra/drizzle-service-case.repository.js';

@Module({
  providers: [
    ServiceCaseService,
    { provide: ServiceCaseRepository, useClass: DrizzleServiceCaseRepository },
  ],
  exports: [ServiceCaseService],
})
export class ServiceCaseModule {}
