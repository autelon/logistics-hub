import type { PurchaseOrderStatus } from '@repo/contracts/procurement';

/** 발주서. 우리가 만드는 문서라 고칠 수 있지만, 발행(ISSUED) 뒤의 변경은 개정 이력을 남긴다. */
export interface PurchaseOrder {
  id: string;
  /** 허브가 채번한다 (`PO-2026-000001`). */
  poNumber: string;
  supplier: string;
  /** 달력 날짜(`YYYY-MM-DD`). 시각이 아니다. */
  orderDate: string;
  status: PurchaseOrderStatus;
  currency: string;
  destinationLocationId: string;
  incoterm: string | null;
  incotermPlace: string | null;
  supplierOrderRef: string | null;
  paymentTerms: string | null;
  remarks: string | null;
  createdAt: Date;
  createdBy: string;
  issuedAt: Date | null;
  issuedBy: string | null;
}

/** 초안일 때 통째로 바꿀 수 있는 헤더 항목. */
export type PurchaseOrderHeader = Pick<
  PurchaseOrder,
  | 'supplier'
  | 'orderDate'
  | 'currency'
  | 'destinationLocationId'
  | 'incoterm'
  | 'incotermPlace'
  | 'supplierOrderRef'
  | 'paymentTerms'
  | 'remarks'
>;

/**
 * 발주 줄. 진행 상황(받은 수량, 완료 여부)은 저장하지 않고 계산한다 (purchase-order-completion.ts).
 * `closed` 는 "더 안 들어온다"는 사람의 선언이고, 완료는 받은 누계에서 나오는 계산 값이다.
 */
export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  lineNo: number;
  productId: string;
  orderedQty: number;
  requestedDeliveryDate: string;
  unitPrice: number | null;
  /** 과납 허용률(%). null 이면 허용 없음(0)으로 본다. */
  overTolerancePct: number | null;
  /** 미납 허용률(%). null 이면 허용 없음(0)으로 본다. */
  underTolerancePct: number | null;
  closed: boolean;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
  cancelled: boolean;
}

/** 줄 번호를 붙이기 전의 줄. */
export type PurchaseOrderLineDraft = Pick<
  PurchaseOrderLine,
  | 'productId'
  | 'orderedQty'
  | 'requestedDeliveryDate'
  | 'unitPrice'
  | 'overTolerancePct'
  | 'underTolerancePct'
>;

/** 저장 전의 줄. id 는 repository 가 발급한다. */
export type NewPurchaseOrderLine = PurchaseOrderLineDraft & { lineNo: number };

/** 저장 전의 발주. id 와 poNumber 는 repository 가 발급한다. */
export type NewPurchaseOrder = Omit<PurchaseOrder, 'id' | 'poNumber'> & {
  lines: NewPurchaseOrderLine[];
};

export interface PurchaseOrderDetail {
  order: PurchaseOrder;
  /** 줄 번호순. */
  lines: PurchaseOrderLine[];
}

/** 줄 번호를 `startAt` 부터 순서대로 붙인다. */
export const numberLines = (
  drafts: readonly PurchaseOrderLineDraft[],
  startAt = 1,
): NewPurchaseOrderLine[] => drafts.map((draft, i) => ({ ...draft, lineNo: startAt + i }));

/** 개정 이력에 남기는 발주의 모습. 발행 뒤에 바뀔 수 있는 것(상태와 줄)만 담는다. */
export interface PurchaseOrderSnapshot {
  status: PurchaseOrderStatus;
  lines: {
    lineNo: number;
    productId: string;
    orderedQty: number;
    requestedDeliveryDate: string;
    unitPrice: number | null;
    overTolerancePct: number | null;
    underTolerancePct: number | null;
    closed: boolean;
    cancelled: boolean;
  }[];
}

export const snapshotOf = ({ order, lines }: PurchaseOrderDetail): PurchaseOrderSnapshot => ({
  status: order.status,
  lines: lines.map((line) => ({
    lineNo: line.lineNo,
    productId: line.productId,
    orderedQty: line.orderedQty,
    requestedDeliveryDate: line.requestedDeliveryDate,
    unitPrice: line.unitPrice,
    overTolerancePct: line.overTolerancePct,
    underTolerancePct: line.underTolerancePct,
    closed: line.closed,
    cancelled: line.cancelled,
  })),
});

export interface PurchaseOrderRevision {
  id: string;
  purchaseOrderId: string;
  revisedAt: Date;
  actor: string;
  reason: string;
  before: PurchaseOrderSnapshot;
  after: PurchaseOrderSnapshot;
}

export type NewPurchaseOrderRevision = Omit<PurchaseOrderRevision, 'id'>;

/** 발주 줄별 받은 누계(줄 id → 수량). 입고·선적 도메인이 생기면 usecase 가 그쪽에서 모아 넘긴다. */
export type ReceivedQuantities = ReadonlyMap<string, number>;

/** 줄 id 목록의 받은 누계를 구해 오는 함수. usecase 가 서비스에 넘긴다 (발주 도메인은 다른 도메인을 모른다). */
export type ReceivedQuantityLookup = (lineIds: readonly string[]) => Promise<ReceivedQuantities>;
