import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { ConfirmDoaRequest, OpenCaseRequest } from '@repo/contracts/as';
import { zod } from '@repo/nest-kit/zod.pipe';

import { ConfirmDoaUsecase } from '../../usecases/confirm-doa.usecase.js';
import { GetCaseUsecase } from '../../usecases/get-case.usecase.js';
import { ListCasesUsecase } from '../../usecases/list-cases.usecase.js';
import { OpenCaseUsecase } from '../../usecases/open-case.usecase.js';
import { RejectCaseUsecase } from '../../usecases/reject-case.usecase.js';
import { ScrapCaseUsecase } from '../../usecases/scrap-case.usecase.js';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly openCase: OpenCaseUsecase,
    private readonly listCases: ListCasesUsecase,
    private readonly getCase: GetCaseUsecase,
    private readonly confirmDoa: ConfirmDoaUsecase,
    private readonly rejectCase: RejectCaseUsecase,
    private readonly scrapCase: ScrapCaseUsecase,
  ) {}

  @Post()
  open(@Body(zod(OpenCaseRequest)) body: OpenCaseRequest) {
    return this.openCase.execute(body);
  }

  @Get()
  list() {
    return this.listCases.execute();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getCase.execute(id);
  }

  @Post(':id/confirm-doa')
  @HttpCode(200)
  confirm(@Param('id') id: string, @Body(zod(ConfirmDoaRequest)) body: ConfirmDoaRequest) {
    return this.confirmDoa.execute(id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string) {
    return this.rejectCase.execute(id);
  }

  @Post(':id/scrap')
  @HttpCode(200)
  scrap(@Param('id') id: string) {
    return this.scrapCase.execute(id);
  }
}
