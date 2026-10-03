import type { NewStockMovement, StockBalance, StockMovement } from './stock-movement.js';

export interface StockMovementRepository {
  /** 한 번에 여러 건. id 는 저장할 때 발급하고, 돌려주는 순서는 넘긴 순서와 같다. */
  insertAll(movements: readonly NewStockMovement[]): Promise<StockMovement[]>;
  /** 이미 저장된 idempotencyKey → 이동 id. 없는 키는 결과에 없다. */
  findIdsByIdempotencyKeys(keys: readonly string[]): Promise<Map<string, string>>;
  /** 행 잠금. 같은 이동을 정정하는 트랜잭션이 줄을 선다. 트랜잭션의 첫 쿼리로 부른다. */
  findByIdForUpdate(id: string): Promise<StockMovement | undefined>;
  /** `id` 를 되돌리는 이동. 없으면 아직 정정되지 않은 것이다. */
  findReversalOf(id: string): Promise<StockMovement | undefined>;
  /** 거점 × 로트 × 재고 상태별 (들어온 합 - 나간 합). 0 인 줄은 빼고 음수는 그대로 둔다. */
  balances(): Promise<StockBalance[]>;
}
export const StockMovementRepository = Symbol('StockMovementRepository');
