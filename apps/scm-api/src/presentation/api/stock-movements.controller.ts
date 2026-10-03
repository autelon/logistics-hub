import { Body, Controller, Param, Post } from '@nestjs/common';

import {
  RecordStockMovementsRequest,
  ReverseStockMovementRequest,
  type RecordStockMovementsResult,
  type ReverseStockMovementResult,
} from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { RecordStockMovementsUsecase } from '../../usecases/record-stock-movements.usecase.js';
import { ReverseStockMovementUsecase } from '../../usecases/reverse-stock-movement.usecase.js';

/** 시리얼 없는(LOT·NONE) 제품의 수량 원장. 재고 조회는 `GET /stock` 에 합쳐져 있다. */
@Controller('stock-movements')
export class StockMovementsController {
  constructor(
    private readonly recordStockMovements: RecordStockMovementsUsecase,
    private readonly reverseStockMovement: ReverseStockMovementUsecase,
  ) {}

  /** 이동을 한꺼번에 기록한다 (1..1000건, 한 트랜잭션). 응답은 요청과 같은 순서. */
  @Post()
  record(
    @Body(zod(RecordStockMovementsRequest)) body: RecordStockMovementsRequest,
  ): Promise<RecordStockMovementsResult> {
    return this.recordStockMovements.execute(body);
  }

  /** 반대 방향의 이동을 추가한다. 이미 되돌렸으면 MOVEMENT_ALREADY_REVERSED. */
  @Post(':id/reversal')
  reverse(
    @Param('id') id: string,
    @Body(zod(ReverseStockMovementRequest)) body: ReverseStockMovementRequest,
  ): Promise<ReverseStockMovementResult> {
    return this.reverseStockMovement.execute(id, body);
  }
}
