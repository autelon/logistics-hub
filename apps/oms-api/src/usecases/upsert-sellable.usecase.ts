import { Inject, Injectable } from '@nestjs/common';

import type { SellableView, UpsertSellableRequest } from '@repo/contracts/oms';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { SellableService } from '../domains/sellable/application/sellable.service.js';

/** 판매 상품 정의를 만들거나 통째로 바꾼다. 머리와 구성품이 한 트랜잭션에 저장된다. */
@Injectable()
export class UpsertSellableUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly sellables: SellableService,
  ) {}

  execute(request: UpsertSellableRequest): Promise<SellableView> {
    return this.tx.run(async () => {
      const { code, name, kind, components } = await this.sellables.upsert(request);
      return { code, name, kind, components };
    });
  }
}
