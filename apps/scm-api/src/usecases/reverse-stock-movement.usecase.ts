import { Inject, Injectable } from '@nestjs/common';

import type { ReverseStockMovementRequest, ReverseStockMovementResult } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { WarehouseService } from '../domains/warehouse/application/warehouse.service.js';

/**
 * 수량 이동을 반대 방향의 이동으로 정정한다. 원래 이동은 바뀌지 않는다.
 * 트랜잭션의 첫 쿼리가 원래 이동의 행 잠금이어야 하므로 이 usecase 는 그 앞에서 다른 것을 읽지 않는다.
 */
@Injectable()
export class ReverseStockMovementUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly warehouse: WarehouseService,
  ) {}

  execute(
    movementId: string,
    request: ReverseStockMovementRequest,
  ): Promise<ReverseStockMovementResult> {
    return this.tx.run(async () => {
      const reversal = await this.warehouse.reverse(movementId, request);
      return { movementId: reversal.id };
    });
  }
}
