import { Inject, Injectable } from '@nestjs/common';

import {
  mergeComponents,
  sellableKindOf,
  type Sellable,
  type SellableComponent,
} from '../domain/sellable.js';
import { SellableRepository } from '../domain/sellable.repository.js';

export interface SellableInput {
  code: string;
  name: string;
  components: readonly SellableComponent[];
}

/** 판매 상품(단품·패키지) 정의. */
@Injectable()
export class SellableService {
  constructor(@Inject(SellableRepository) private readonly sellables: SellableRepository) {}

  /** 구성품을 합치고 종류를 정해 저장한다. 같은 코드로 다시 오면 구성을 통째로 바꾼다. */
  async upsert(input: SellableInput): Promise<Sellable> {
    const components = mergeComponents(input.components);
    const sellable: Sellable = {
      code: input.code,
      name: input.name,
      kind: sellableKindOf(components),
      components,
    };
    await this.sellables.save(sellable);
    return sellable;
  }

  list(): Promise<Sellable[]> {
    return this.sellables.findAll();
  }

  /** 주문이 참조하는 코드들의 정의. 없는 코드는 결과에 없으므로 호출 측이 빠진 것을 가려낸다. */
  findByCodes(codes: readonly string[]): Promise<Sellable[]> {
    return this.sellables.findByCodes(codes);
  }
}
