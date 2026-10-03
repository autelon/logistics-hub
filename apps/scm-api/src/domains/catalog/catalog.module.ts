import { Module } from '@nestjs/common';

import { CatalogService } from './application/catalog.service.js';
import { LocationPolicyService } from './application/location-policy.service.js';
import { CatalogRepository } from './domain/catalog.repository.js';
import { LocationPolicyRepository } from './domain/location-policy.repository.js';
import { DrizzleCatalogRepository } from './infra/drizzle-catalog.repository.js';
import { DrizzleLocationPolicyRepository } from './infra/drizzle-location-policy.repository.js';

@Module({
  providers: [
    CatalogService,
    LocationPolicyService,
    { provide: CatalogRepository, useClass: DrizzleCatalogRepository },
    { provide: LocationPolicyRepository, useClass: DrizzleLocationPolicyRepository },
  ],
  exports: [CatalogService, LocationPolicyService],
})
export class CatalogModule {}
