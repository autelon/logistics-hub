import { Body, Controller, Get, Post } from '@nestjs/common';

import { UpsertSellableRequest, type SellableView } from '@repo/contracts/oms';
import { zod } from '@repo/nest-kit/zod.pipe';

import { ListSellablesUsecase } from '../../usecases/list-sellables.usecase.js';
import { UpsertSellableUsecase } from '../../usecases/upsert-sellable.usecase.js';

/** 판매 상품(단품·패키지) 정의. 같은 코드로 다시 보내면 구성을 통째로 바꾼다 (id 는 처음 것이 유지된다). */
@Controller('sellables')
export class SellablesController {
  constructor(
    private readonly upsertSellable: UpsertSellableUsecase,
    private readonly listSellables: ListSellablesUsecase,
  ) {}

  @Post()
  upsert(@Body(zod(UpsertSellableRequest)) body: UpsertSellableRequest): Promise<SellableView> {
    return this.upsertSellable.execute(body);
  }

  @Get()
  list(): Promise<SellableView[]> {
    return this.listSellables.execute();
  }
}
