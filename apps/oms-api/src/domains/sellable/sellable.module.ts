import { Module } from '@nestjs/common';

import { SellableService } from './application/sellable.service.js';
import { SellableRepository } from './domain/sellable.repository.js';
import { DrizzleSellableRepository } from './infra/drizzle-sellable.repository.js';

@Module({
  providers: [
    SellableService,
    { provide: SellableRepository, useClass: DrizzleSellableRepository },
  ],
  exports: [SellableService],
})
export class SellableModule {}
