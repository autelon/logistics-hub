import { Inject, Injectable } from '@nestjs/common';

import { scmError } from '../../../errors.js';
import {
  movementShapeProblem,
  planRecording,
  reversalOf,
  type NewStockMovement,
  type StockBalance,
  type StockMovement,
} from '../domain/stock-movement.js';
import { StockMovementRepository } from '../domain/stock-movement.repository.js';

const requireAt = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing recording result at ${index}`);
  return item;
};

/** 요청 항목 하나의 결과. */
export interface RecordedMovement {
  movementId: string;
  /** 같은 idempotencyKey 의 이동이 이미 있어 새로 기록하지 않았다. */
  duplicate: boolean;
}

/**
 * 시리얼 없는 제품의 수량 원장. 제품·거점 해석(코드 → id)과 추적 방식 검사는 usecase 몫이라 여기서는 id 만 받는다.
 * 트랜잭션은 usecase 가 연다.
 */
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(StockMovementRepository) private readonly movements: StockMovementRepository,
  ) {}

  /**
   * 이동을 요청 순서대로 기록한다. 이미 있는 idempotencyKey(저장된 것이든 같은 요청의 앞 항목이든)는
   * 새로 기록하지 않고 기존 이동을 가리킨다. 돌려주는 순서는 넘긴 순서와 같다.
   */
  async record(items: readonly NewStockMovement[]): Promise<RecordedMovement[]> {
    for (const item of items) {
      const problem = movementShapeProblem(item);
      // 입구(zod)와 DB 제약이 먼저 막는 값이다. 여기까지 왔다면 서비스 에러가 아니라 입구가 뚫린 것이다.
      if (problem) throw new Error(`Invalid stock movement reached the ledger: ${problem}`);
    }

    const keys = items.map((item) => item.idempotencyKey);
    const stored = await this.movements.findIdsByIdempotencyKeys(
      keys.filter((key): key is string => key !== null),
    );
    const slots = planRecording(keys, stored);

    const inserted = await this.movements.insertAll(
      items.filter((_, index) => slots[index]?.kind === 'insert'),
    );

    const results: RecordedMovement[] = [];
    for (const slot of slots) {
      if (slot.kind === 'insert') {
        results.push({ movementId: requireAt(inserted, slot.order).id, duplicate: false });
      } else if (slot.kind === 'existing') {
        results.push({ movementId: slot.movementId, duplicate: true });
      } else {
        results.push({ movementId: requireAt(results, slot.index).movementId, duplicate: true });
      }
    }
    return results;
  }

  /**
   * 이동을 되돌리는 반대 방향의 이동을 추가한다. 원래 이동은 바뀌지 않는다.
   * 이동 하나는 한 번만 되돌릴 수 있다. 되돌린 이동(역분개)도 이동이라 다시 되돌릴 수 있다.
   *
   * 트랜잭션의 첫 쿼리로 부른다. 원래 이동 행을 잠근 뒤에 정정 여부를 읽어야
   * 같은 이동을 동시에 정정하는 두 요청 중 하나가 먼저 커밋된 정정을 본다.
   */
  async reverse(
    movementId: string,
    correction: { reason: string; actor: string },
    now: Date = new Date(),
  ): Promise<StockMovement> {
    const original = await this.movements.findByIdForUpdate(movementId);
    if (!original) throw scmError('MOVEMENT_NOT_FOUND', `No stock movement ${movementId}`);
    if (await this.movements.findReversalOf(movementId)) {
      throw scmError(
        'MOVEMENT_ALREADY_REVERSED',
        `Stock movement ${movementId} was already reversed`,
      );
    }
    const [reversal] = await this.movements.insertAll([reversalOf(original, correction, now)]);
    if (!reversal) throw new Error('Reversal movement was not stored');
    return reversal;
  }

  balances(): Promise<StockBalance[]> {
    return this.movements.balances();
  }
}
