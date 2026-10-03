import { z } from 'zod';

// 발주(procurement). 에러 코드는 서비스 하나의 목록이라 scm.ts 의 ScmErrorCode 에 있다.
// 의미와 근거는 docs/06-inbound-design.md 의 "발주".

export const PurchaseOrderStatus = z.enum(['DRAFT', 'ISSUED', 'CANCELLED']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus>;

/**
 * 발주 줄의 완료 상태. 저장하지 않고 받은 누계에서 매번 계산한다.
 * OVER 는 누계가 과납 허용을 넘은 상태(이상), CLOSED_SHORT 는 덜 왔는데 "더 안 온다"고 닫은 상태다.
 * CANCELLED 는 개정으로 취소한 줄이다.
 */
export const LineCompletion = z.enum(['OPEN', 'COMPLETE', 'OVER', 'CLOSED_SHORT', 'CANCELLED']);
export type LineCompletion = z.infer<typeof LineCompletion>;

// ---------- HTTP 요청 ----------

const IsoDate = z.iso.date();

/** 소수 자릿수가 `places` 이하인 수. 컬럼의 scale 을 넘으면 DB 가 조용히 반올림하므로 미리 거절한다. */
const withinDecimalPlaces = (places: number) => (value: number) => {
  const scaled = value * 10 ** places;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
};

const Quantity = z.number().int().min(1).max(100_000_000);
const UnitPrice = z.number().min(0).max(99_999_999_999).refine(withinDecimalPlaces(4), {
  message: 'At most 4 decimal places',
});
/** 과납 허용률(%). */
const OverTolerancePct = z.number().min(0).max(100).refine(withinDecimalPlaces(2), {
  message: 'At most 2 decimal places',
});
/** 미납 허용률(%). 100 이면 하나도 안 와도 완료가 되므로 100 미만이다. */
const UnderTolerancePct = z.number().min(0).max(99.99).refine(withinDecimalPlaces(2), {
  message: 'At most 2 decimal places',
});

export const PurchaseOrderLineInput = z.object({
  sku: z.string().min(1).max(64),
  orderedQty: Quantity,
  requestedDeliveryDate: IsoDate,
  unitPrice: UnitPrice.nullable().default(null),
  overTolerancePct: OverTolerancePct.nullable().default(null),
  underTolerancePct: UnderTolerancePct.nullable().default(null),
});
export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineInput>;

const PurchaseOrderFields = z.object({
  supplier: z.string().min(1).max(200),
  orderDate: IsoDate,
  /** ISO 4217 세 글자. */
  currency: z.string().regex(/^[A-Z]{3}$/),
  destinationLocationCode: z.string().min(1).max(64),
  incoterm: z.string().min(1).max(8).nullable().default(null),
  incotermPlace: z.string().min(1).max(100).nullable().default(null),
  supplierOrderRef: z.string().min(1).max(100).nullable().default(null),
  paymentTerms: z.string().min(1).max(200).nullable().default(null),
  remarks: z.string().min(1).max(1000).nullable().default(null),
  /** 줄 번호는 배열 순서대로 1부터 붙는다. */
  lines: z.array(PurchaseOrderLineInput).min(1).max(500),
});

/** 발주 초안을 만든다. 발주 번호는 허브가 채번한다. */
export const CreatePurchaseOrderRequest = PurchaseOrderFields.extend({
  actor: z.string().min(1).max(100),
});
export type CreatePurchaseOrderRequest = z.infer<typeof CreatePurchaseOrderRequest>;
export type CreatePurchaseOrderInput = z.input<typeof CreatePurchaseOrderRequest>;

/** 초안(DRAFT)을 통째로 바꾼다. 줄도 이 본문의 것으로 바뀐다. */
export const UpdatePurchaseOrderRequest = PurchaseOrderFields;
export type UpdatePurchaseOrderRequest = z.infer<typeof UpdatePurchaseOrderRequest>;

export const IssuePurchaseOrderRequest = z.object({ actor: z.string().min(1).max(100) });
export type IssuePurchaseOrderRequest = z.infer<typeof IssuePurchaseOrderRequest>;

const LineChange = z
  .object({
    lineNo: z.number().int().min(1),
    orderedQty: Quantity.optional(),
    requestedDeliveryDate: IsoDate.optional(),
    unitPrice: UnitPrice.nullable().optional(),
    overTolerancePct: OverTolerancePct.nullable().optional(),
    underTolerancePct: UnderTolerancePct.nullable().optional(),
  })
  .refine((change) => Object.keys(change).some((key) => key !== 'lineNo'), {
    message: 'At least one field to change is required besides lineNo',
  });
export type LineChange = z.infer<typeof LineChange>;

/** 발행(ISSUED) 뒤의 변경. 보낸 줄의 보낸 항목만 바뀌고, 변경 전후 전체가 개정 이력에 남는다. */
export const RevisePurchaseOrderRequest = z.object({
  reason: z.string().min(1).max(500),
  actor: z.string().min(1).max(100),
  changes: z
    .object({
      updateLines: z.array(LineChange).default([]),
      cancelLines: z.array(z.number().int().min(1)).default([]),
      addLines: z.array(PurchaseOrderLineInput).default([]),
    })
    .refine(
      (changes) =>
        changes.updateLines.length + changes.cancelLines.length + changes.addLines.length > 0,
      { message: 'At least one change is required' },
    )
    .refine(
      (changes) => {
        const lineNos = [...changes.updateLines.map((c) => c.lineNo), ...changes.cancelLines];
        return new Set(lineNos).size === lineNos.length;
      },
      { message: 'A line can be changed or cancelled only once per revision' },
    ),
});
export type RevisePurchaseOrderRequest = z.infer<typeof RevisePurchaseOrderRequest>;
export type RevisePurchaseOrderInput = z.input<typeof RevisePurchaseOrderRequest>;

/** 더 안 들어온다고 줄을 닫는다 (미달 납품). */
export const ClosePurchaseOrderLineRequest = z.object({
  reason: z.string().min(1).max(500),
  actor: z.string().min(1).max(100),
});
export type ClosePurchaseOrderLineRequest = z.infer<typeof ClosePurchaseOrderLineRequest>;

export const CancelPurchaseOrderRequest = z.object({
  reason: z.string().min(1).max(500),
  actor: z.string().min(1).max(100),
});
export type CancelPurchaseOrderRequest = z.infer<typeof CancelPurchaseOrderRequest>;

// ---------- HTTP 응답 ----------

export interface PurchaseOrderLineView {
  lineNo: number;
  sku: string;
  orderedQty: number;
  requestedDeliveryDate: string;
  unitPrice: number | null;
  overTolerancePct: number | null;
  underTolerancePct: number | null;
  /** 받은 누계. 입고·선적 기능이 생기기 전에는 항상 0 이다. */
  receivedQty: number;
  /** 아직 들어올 것으로 기대하는 수량. OPEN 이 아니면 0. */
  openQty: number;
  completion: LineCompletion;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
  cancelled: boolean;
}

export interface PurchaseOrderView {
  poNumber: string;
  supplier: string;
  orderDate: string;
  status: PurchaseOrderStatus;
  currency: string;
  destinationLocationCode: string;
  incoterm: string | null;
  incotermPlace: string | null;
  supplierOrderRef: string | null;
  paymentTerms: string | null;
  remarks: string | null;
  createdAt: string;
  createdBy: string;
  issuedAt: string | null;
  issuedBy: string | null;
  lines: PurchaseOrderLineView[];
}

export interface PurchaseOrderSummaryView {
  poNumber: string;
  supplier: string;
  orderDate: string;
  status: PurchaseOrderStatus;
  currency: string;
  destinationLocationCode: string;
  /** 취소한 줄을 뺀 줄 수와 주문 수량 합. */
  lineCount: number;
  orderedQty: number;
}

/** 개정 이력에 남는 발주 전체의 모습. 개정으로 바뀌는 것(상태와 줄)만 담는다. */
export interface PurchaseOrderSnapshotView {
  status: PurchaseOrderStatus;
  lines: {
    lineNo: number;
    sku: string;
    orderedQty: number;
    requestedDeliveryDate: string;
    unitPrice: number | null;
    overTolerancePct: number | null;
    underTolerancePct: number | null;
    closed: boolean;
    cancelled: boolean;
  }[];
}

export interface PurchaseOrderRevisionView {
  id: string;
  revisedAt: string;
  actor: string;
  reason: string;
  before: PurchaseOrderSnapshotView;
  after: PurchaseOrderSnapshotView;
}
