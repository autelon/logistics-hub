import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';

import { ConfirmDoaRequest, OpenCaseRequest } from '@repo/contracts/as';
import { zod } from '@repo/nest-kit/zod.pipe';

import { CasesService } from './cases.service.js';

@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  open(@Body(zod(OpenCaseRequest)) body: OpenCaseRequest) {
    return this.cases.open(body);
  }

  @Get()
  list() {
    return this.cases.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(id);
  }

  @Post(':id/confirm-doa')
  @HttpCode(200)
  confirmDoa(@Param('id') id: string, @Body(zod(ConfirmDoaRequest)) body: ConfirmDoaRequest) {
    return this.cases.confirmDoa(id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string) {
    return this.cases.reject(id);
  }

  @Post(':id/scrap')
  @HttpCode(200)
  scrap(@Param('id') id: string) {
    return this.cases.scrap(id);
  }
}
