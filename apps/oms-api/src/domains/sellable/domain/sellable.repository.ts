import type { Sellable } from './sellable.js';

export interface SellableRepository {
  /** 같은 코드가 있으면 이름·종류를 바꾸고 구성을 통째로 교체한다 (행의 id 는 처음 것이 유지된다). */
  save(sellable: Sellable): Promise<void>;
  /** 코드 순, 구성품은 SKU 순. */
  findAll(): Promise<Sellable[]>;
  /** 정의가 없는 코드는 결과에 없다. 순서는 `findAll` 과 같다. */
  findByCodes(codes: readonly string[]): Promise<Sellable[]>;
}
export const SellableRepository = Symbol('SellableRepository');
