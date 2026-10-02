import { Inject, Injectable } from '@nestjs/common';

import type { OpenCaseRequest, ServiceCaseView } from '@repo/contracts/as';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { ServiceCaseService } from '../domains/service-case/application/service-case.service.js';
import { toServiceCaseView } from './service-case-view.js';

@Injectable()
export class OpenCaseUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly cases: ServiceCaseService,
  ) {}

  /** 접수 번호 발급과 저장이 같은 트랜잭션이어야 번호가 겹치지 않는다. */
  execute(request: OpenCaseRequest): Promise<ServiceCaseView> {
    return this.tx.run(async () => toServiceCaseView(await this.cases.open(request)));
  }
}
