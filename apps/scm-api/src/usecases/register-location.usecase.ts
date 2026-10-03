import { Inject, Injectable } from '@nestjs/common';

import type { LocationView, RegisterLocationRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';

/** 같은 code 로 다시 등록하면 내용을 갱신한다. */
@Injectable()
export class RegisterLocationUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
  ) {}

  execute(request: RegisterLocationRequest): Promise<LocationView> {
    return this.tx.run(async () => {
      await this.catalog.registerLocation(request);
      const { code, name, type, partner } = request;
      return { code, name, type, partner };
    });
  }
}
