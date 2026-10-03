import { Module } from '@nestjs/common';

import { OrderModule } from '../domains/order/order.module.js';
import { SellableModule } from '../domains/sellable/sellable.module.js';
import { ApplyDoaConfirmedUsecase } from './apply-doa-confirmed.usecase.js';
import { ApplyUnitEventUsecase } from './apply-unit-event.usecase.js';
import { GetOrderUsecase } from './get-order.usecase.js';
import { IngestOrderUsecase } from './ingest-order.usecase.js';
import { ListOrdersUsecase } from './list-orders.usecase.js';
import { ListSellablesUsecase } from './list-sellables.usecase.js';
import { UpsertSellableUsecase } from './upsert-sellable.usecase.js';

const usecases = [
  UpsertSellableUsecase,
  ListSellablesUsecase,
  IngestOrderUsecase,
  GetOrderUsecase,
  ListOrdersUsecase,
  ApplyUnitEventUsecase,
  ApplyDoaConfirmedUsecase,
];

@Module({
  imports: [SellableModule, OrderModule],
  providers: usecases,
  exports: usecases,
})
export class UsecasesModule {}
