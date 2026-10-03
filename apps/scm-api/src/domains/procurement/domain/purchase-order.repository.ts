import type {
  NewPurchaseOrder,
  NewPurchaseOrderLine,
  NewPurchaseOrderRevision,
  PurchaseOrderDetail,
  PurchaseOrderHeader,
  PurchaseOrderLine,
  PurchaseOrderRevision,
} from './purchase-order.js';

export interface PurchaseOrderRepository {
  /** id 와 발주 번호(`PO-연도-일련번호`)를 발급해 저장한다. 일련번호 카운터를 잠그므로 트랜잭션 안에서 부른다. */
  insert(draft: NewPurchaseOrder): Promise<PurchaseOrderDetail>;
  findByPoNumber(poNumber: string): Promise<PurchaseOrderDetail | undefined>;
  /**
   * 발주 행을 잠그고 읽는다. 같은 발주를 바꾸는 트랜잭션을 줄 세우는 용도라 트랜잭션의 첫 쿼리로 부른다
   * (REPEATABLE READ 의 스냅샷은 첫 일반 읽기 때 잡히므로, 그 뒤에 잠금을 얻으면 먼저 커밋된 변경을 못 본다).
   */
  findByPoNumberForUpdate(poNumber: string): Promise<PurchaseOrderDetail | undefined>;
  /** 최신순(만든 순서의 역순). */
  listRecent(limit: number): Promise<PurchaseOrderDetail[]>;

  /** 초안의 헤더를 덮어쓰고 줄을 모두 지우고 다시 넣는다. */
  replaceDraftContents(
    purchaseOrderId: string,
    header: PurchaseOrderHeader,
    lines: readonly NewPurchaseOrderLine[],
  ): Promise<void>;
  markIssued(purchaseOrderId: string, issuedAt: Date, issuedBy: string): Promise<void>;
  markCancelled(purchaseOrderId: string): Promise<void>;

  /** 기존 줄의 값을 덮어쓴다 (줄 번호와 제품은 바뀌지 않는다). */
  saveLine(line: PurchaseOrderLine): Promise<void>;
  addLines(
    purchaseOrderId: string,
    lines: readonly NewPurchaseOrderLine[],
  ): Promise<PurchaseOrderLine[]>;

  addRevision(revision: NewPurchaseOrderRevision): Promise<void>;
  /** 최신순. */
  listRevisions(purchaseOrderId: string, limit: number): Promise<PurchaseOrderRevision[]>;
}
export const PurchaseOrderRepository = Symbol('PurchaseOrderRepository');
