import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CorrectUnitEventRequest, RecordUnitEventRequest } from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { UnitsService } from './units.service.js';

@Controller()
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  /** 업체(연동 어댑터)가 사실을 보고하는 입구. */
  @Post('unit-events')
  record(@Body(zod(RecordUnitEventRequest)) body: RecordUnitEventRequest) {
    return this.units.record(body);
  }

  @Post('unit-events/:id/corrections')
  correct(
    @Param('id') id: string,
    @Body(zod(CorrectUnitEventRequest)) body: CorrectUnitEventRequest,
  ) {
    return this.units.correct(id, body);
  }

  @Get('units/:serialNumber')
  lifecycle(@Param('serialNumber') serialNumber: string) {
    return this.units.lifecycle(serialNumber);
  }

  @Get('stock')
  stock() {
    return this.units.stock();
  }
}
