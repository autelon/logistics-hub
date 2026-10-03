import { Module } from '@nestjs/common';

import { CatalogService } from './application/catalog.service.js';
import { CatalogRepository } from './domain/catalog.repository.js';
import { DrizzleCatalogRepository } from './infra/drizzle-catalog.repository.js';

@Module({
  providers: [CatalogService, { provide: CatalogRepository, useClass: DrizzleCatalogRepository }],
  exports: [CatalogService],
})
export class CatalogModule {}
