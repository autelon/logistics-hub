import { Inject, Injectable } from '@nestjs/common';

import type { ConfirmDoaRequest, ServiceCaseView } from '@repo/contracts/as';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { ServiceCaseService } from '../domains/service-case/application/service-case.service.js';
import { toServiceCaseView } from './service-case-view.js';

@Injectable()
export class ConfirmDoaUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly cases: ServiceCaseService,
  ) {}

  execute(id: string, request: ConfirmDoaRequest): Promise<ServiceCaseView> {
    return this.tx.run(async () =>
      toServiceCaseView(await this.cases.confirmDoa(id, request.disposition)),
    );
  }
}
