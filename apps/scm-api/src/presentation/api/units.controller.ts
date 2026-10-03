import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import {
  CorrectUnitEventRequest,
  RecordUnitEventRequest,
  type StockRow,
  type UnitLifecycleView,
} from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import {
  CorrectUnitEventUsecase,
  type CorrectUnitEventResult,
} from '../../usecases/correct-unit-event.usecase.js';
import { GetStockUsecase } from '../../usecases/get-stock.usecase.js';
import { GetUnitLifecycleUsecase } from '../../usecases/get-unit-lifecycle.usecase.js';
import {
  RecordUnitEventUsecase,
  type RecordUnitEventResult,
} from '../../usecases/record-unit-event.usecase.js';

@Controller()
export class UnitsController {
  constructor(
    private readonly recordUnitEvent: RecordUnitEventUsecase,
    private readonly correctUnitEvent: CorrectUnitEventUsecase,
    private readonly getUnitLifecycle: GetUnitLifecycleUsecase,
    private readonly getStock: GetStockUsecase,
  ) {}

  /** 업체(연동 어댑터)가 사실을 보고하는 입구. */
  @Post('unit-events')
  record(
    @Body(zod(RecordUnitEventRequest)) body: RecordUnitEventRequest,
  ): Promise<RecordUnitEventResult> {
    return this.recordUnitEvent.execute(body);
  }

  @Post('unit-events/:id/corrections')
  correct(
    @Param('id') id: string,
    @Body(zod(CorrectUnitEventRequest)) body: CorrectUnitEventRequest,
  ): Promise<CorrectUnitEventResult> {
    return this.correctUnitEvent.execute(id, body);
  }

  @Get('units/:serialNumber')
  lifecycle(@Param('serialNumber') serialNumber: string): Promise<UnitLifecycleView> {
    return this.getUnitLifecycle.execute(serialNumber);
  }

  @Get('stock')
  stock(): Promise<StockRow[]> {
    return this.getStock.execute();
  }
}
