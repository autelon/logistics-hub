import { Module } from '@nestjs/common';

import { CatalogModule } from '../domains/catalog/catalog.module.js';
import { DeviceRequestModule } from '../domains/device-request/device-request.module.js';
import { ProcurementModule } from '../domains/procurement/procurement.module.js';
import { TransportModule } from '../domains/transport/transport.module.js';
import { UnitModule } from '../domains/unit/unit.module.js';
import { WarehouseModule } from '../domains/warehouse/warehouse.module.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';
import { CancelPurchaseOrderUsecase } from './cancel-purchase-order.usecase.js';
import { ClosePurchaseOrderLineUsecase } from './close-purchase-order-line.usecase.js';
import { CorrectUnitEventUsecase } from './correct-unit-event.usecase.js';
import { CreatePurchaseOrderUsecase } from './create-purchase-order.usecase.js';
import { GetDeviceRequestUsecase } from './get-device-request.usecase.js';
import { GetPurchaseOrderUsecase } from './get-purchase-order.usecase.js';
import { GetShipmentUsecase } from './get-shipment.usecase.js';
import { GetStockUsecase } from './get-stock.usecase.js';
import { GetUnitLifecycleUsecase } from './get-unit-lifecycle.usecase.js';
import { IntakeShipmentsUsecase } from './intake-shipments.usecase.js';
import { IssuePurchaseOrderUsecase } from './issue-purchase-order.usecase.js';
import { LinkShipmentUsecase } from './link-shipment.usecase.js';
import { ListDeviceRequestUnitsUsecase } from './list-device-request-units.usecase.js';
import { ListDeviceRequestsUsecase } from './list-device-requests.usecase.js';
import { ListLocationPolicyChangesUsecase } from './list-location-policy-changes.usecase.js';
import { ListLocationsUsecase } from './list-locations.usecase.js';
import { ListProductsUsecase } from './list-products.usecase.js';
import { ListPurchaseOrderRevisionsUsecase } from './list-purchase-order-revisions.usecase.js';
import { ListPurchaseOrdersUsecase } from './list-purchase-orders.usecase.js';
import { ListShipmentsUsecase } from './list-shipments.usecase.js';
import { NotifyDeviceRequestUsecase } from './notify-device-request.usecase.js';
import { RecordStockMovementsUsecase } from './record-stock-movements.usecase.js';
import { RecordUnitEventUsecase } from './record-unit-event.usecase.js';
import { RegisterLocationUsecase } from './register-location.usecase.js';
import { RegisterProductUsecase } from './register-product.usecase.js';
import { RegisterUnitsUsecase } from './register-units.usecase.js';
import { ReportDeviceResultsUsecase } from './report-device-results.usecase.js';
import { ReverseStockMovementUsecase } from './reverse-stock-movement.usecase.js';
import { RevisePurchaseOrderUsecase } from './revise-purchase-order.usecase.js';
import { UpdateLocationPolicyUsecase } from './update-location-policy.usecase.js';
import { UpdatePurchaseOrderUsecase } from './update-purchase-order.usecase.js';
import { VoidShipmentUsecase } from './void-shipment.usecase.js';

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
  RecordStockMovementsUsecase,
  ReverseStockMovementUsecase,
  CreatePurchaseOrderUsecase,
  UpdatePurchaseOrderUsecase,
  IssuePurchaseOrderUsecase,
  RevisePurchaseOrderUsecase,
  ClosePurchaseOrderLineUsecase,
  CancelPurchaseOrderUsecase,
  ListPurchaseOrdersUsecase,
  GetPurchaseOrderUsecase,
  ListPurchaseOrderRevisionsUsecase,
  IntakeShipmentsUsecase,
  ListShipmentsUsecase,
  GetShipmentUsecase,
  LinkShipmentUsecase,
  VoidShipmentUsecase,
];

@Module({
  imports: [
    CatalogModule,
    UnitModule,
    DeviceRequestModule,
    WarehouseModule,
    ProcurementModule,
    TransportModule,
  ],
  providers: usecases,
  exports: usecases,
})
export class UsecasesModule {}
