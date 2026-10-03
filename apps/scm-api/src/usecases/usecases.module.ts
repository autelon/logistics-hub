import { Module } from '@nestjs/common';

import { CatalogModule } from '../domains/catalog/catalog.module.js';
import { UnitModule } from '../domains/unit/unit.module.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';
import { CorrectUnitEventUsecase } from './correct-unit-event.usecase.js';
import { GetStockUsecase } from './get-stock.usecase.js';
import { GetUnitLifecycleUsecase } from './get-unit-lifecycle.usecase.js';
import { ListLocationsUsecase } from './list-locations.usecase.js';
import { ListProductsUsecase } from './list-products.usecase.js';
import { RecordUnitEventUsecase } from './record-unit-event.usecase.js';
import { RegisterLocationUsecase } from './register-location.usecase.js';
import { RegisterProductUsecase } from './register-product.usecase.js';

const usecases = [
  RegisterProductUsecase,
  ListProductsUsecase,
  RegisterLocationUsecase,
  ListLocationsUsecase,
  RecordUnitEventUsecase,
  CorrectUnitEventUsecase,
  GetUnitLifecycleUsecase,
  GetStockUsecase,
  ApplyAsCaseEventUsecase,
];

@Module({
  imports: [CatalogModule, UnitModule],
  providers: usecases,
  exports: usecases,
})
export class UsecasesModule {}
