import { Body, Controller, Post } from '@nestjs/common';

import { RegisterUnitsRequest, type RegisterUnitsResult } from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { RegisterUnitsUsecase } from '../../usecases/register-units.usecase.js';

/** 운영자가 시리얼 목록을 제품으로 등록한다. 등록하지 못한 시리얼은 사유와 함께 응답에 담긴다. */
@Controller('unit-registrations')
export class UnitRegistrationsController {
  constructor(private readonly registerUnits: RegisterUnitsUsecase) {}

  @Post()
  register(
    @Body(zod(RegisterUnitsRequest)) body: RegisterUnitsRequest,
  ): Promise<RegisterUnitsResult> {
    return this.registerUnits.execute(body);
  }
}
