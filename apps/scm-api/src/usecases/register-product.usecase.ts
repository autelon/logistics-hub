import { Inject, Injectable } from '@nestjs/common';

import type { ProductView, RegisterProductRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';

/** 같은 sku 로 다시 등록하면 내용을 갱신한다. */
@Injectable()
export class RegisterProductUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
  ) {}

  execute(request: RegisterProductRequest): Promise<ProductView> {
    return this.tx.run(async () => {
      await this.catalog.registerProduct(request);
      return { sku: request.sku, name: request.name };
    });
  }
}
