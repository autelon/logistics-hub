import { Module } from '@nestjs/common';

import { ServiceCaseModule } from '../domains/service-case/service-case.module.js';
import { ConfirmDoaUsecase } from './confirm-doa.usecase.js';
import { GetCaseUsecase } from './get-case.usecase.js';
import { ListCasesUsecase } from './list-cases.usecase.js';
import { OpenCaseUsecase } from './open-case.usecase.js';
import { RejectCaseUsecase } from './reject-case.usecase.js';
import { ScrapCaseUsecase } from './scrap-case.usecase.js';

const usecases = [
  OpenCaseUsecase,
  ListCasesUsecase,
  GetCaseUsecase,
  ConfirmDoaUsecase,
  RejectCaseUsecase,
  ScrapCaseUsecase,
];

@Module({
  imports: [ServiceCaseModule],
  providers: usecases,
  exports: usecases,
})
export class UsecasesModule {}
