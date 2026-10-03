import { Module } from '@nestjs/common';

import { CatalogModule } from '../domains/catalog/catalog.module.js';
import { DeviceRequestModule } from '../domains/device-request/device-request.module.js';
import { UnitModule } from '../domains/unit/unit.module.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';
import { CorrectUnitEventUsecase } from './correct-unit-event.usecase.js';
import { GetDeviceRequestUsecase } from './get-device-request.usecase.js';
import { GetStockUsecase } from './get-stock.usecase.js';
import { GetUnitLifecycleUsecase } from './get-unit-lifecycle.usecase.js';
import { ListDeviceRequestUnitsUsecase } from './list-device-request-units.usecase.js';
import { ListDeviceRequestsUsecase } from './list-device-requests.usecase.js';
import { ListLocationPolicyChangesUsecase } from './list-location-policy-changes.usecase.js';
import { ListLocationsUsecase } from './list-locations.usecase.js';
import { ListProductsUsecase } from './list-products.usecase.js';
import { NotifyDeviceRequestUsecase } from './notify-device-request.usecase.js';
import { RecordUnitEventUsecase } from './record-unit-event.usecase.js';
import { RegisterLocationUsecase } from './register-location.usecase.js';
import { RegisterProductUsecase } from './register-product.usecase.js';
import { RegisterUnitsUsecase } from './register-units.usecase.js';
import { ReportDeviceResultsUsecase } from './report-device-results.usecase.js';
import { UpdateLocationPolicyUsecase } from './update-location-policy.usecase.js';

const usecases = [
  RegisterProductUsecase,
  ListProductsUsecase,
  RegisterLocationUsecase,
  ListLocationsUsecase,
  UpdateLocationPolicyUsecase,
  ListLocationPolicyChangesUsecase,
  RecordUnitEventUsecase,
  CorrectUnitEventUsecase,
  GetUnitLifecycleUsecase,
  GetStockUsecase,
  ApplyAsCaseEventUsecase,
  RegisterUnitsUsecase,
  ListDeviceRequestsUsecase,
  GetDeviceRequestUsecase,
  ListDeviceRequestUnitsUsecase,
  ReportDeviceResultsUsecase,
  NotifyDeviceRequestUsecase,
];

@Module({
  imports: [CatalogModule, UnitModule, DeviceRequestModule],
  providers: usecases,
  exports: usecases,
})
export class UsecasesModule {}
