import { z } from 'zod';

import { IsoDateTime } from './common.js';

// 선적(transport). 에러 코드는 서비스 하나의 목록이라 scm.ts 의 ScmErrorCode 에 있다.
// 의미와 근거는 docs/06-inbound-design.md 의 "선적", 규칙은 docs/02-domain-model.md 의 "선적".

export const ShipmentMode = z.enum(['SEA', 'AIR', 'ROAD']);
export type ShipmentMode = z.infer<typeof ShipmentMode>;

/**
 * 선적 보고에서 찾은 이상. 업체가 보고한 사실이라 거부하지 않고 이 코드로 표시한다.
 * `PO_UNLINKED`·`PO_LINE_UNMATCHED` 는 운영자가 발주에 연결하면(`POST /shipments/:shipmentNo/link`) 해소된다.
 */
export const ShipmentAnomalyCode = z.enum([
  'PO_UNLINKED', // 모르는 발주 번호이거나 ISSUED 가 아닌 발주를 가리킴
  'PO_LINE_UNMATCHED', // 발주에 같은 SKU 의 줄이 없음
  'PO_LINE_CLOSED', // 닫힌(미달 납품 선언) 발주 줄로 선적됨
  'PO_LINE_CANCELLED', // 취소된 발주 줄로 선적됨
  'OVER_SHIPPED', // 선적 누계가 주문 수량 + 과납 허용을 넘음
  'SERIAL_COUNT_MISMATCH', // 시리얼 추적 제품인데 시리얼 수가 수량과 다름 (목록이 없는 경우 포함)
  'SERIALS_ON_UNTRACKED_PRODUCT', // 시리얼 추적 제품이 아닌데 시리얼이 옴. 개체는 만들지 않는다
  'DUPLICATE_SERIAL', // 같은 시리얼이 다른 선적이나 같은 선적의 다른 줄·같은 줄에 또 있음
  'SERIAL_SKU_CONFLICT', // 이미 다른 SKU 로 등록된 시리얼. 제품 이력 사실은 남기지 않는다
]);
export type ShipmentAnomalyCode = z.infer<typeof ShipmentAnomalyCode>;

/** 한 요청이 받는 시리얼 총수의 상한. 본문 한도(4MB)와 한 트랜잭션의 크기를 함께 막는다. */
export const MAX_INTAKE_SERIALS = 50_000;

const IsoDate = z.iso.date();

export const ShipmentIntakeLine = z.object({
  sku: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(2_147_483_647),
  lotNo: z.string().min(1).max(100).nullable().default(null),
  /** 없으면 빈 목록. 시리얼 추적 제품이면 목록이 없거나 수량과 다를 때 이상으로 표시한다. */
  serialNumbers: z.array(z.string().min(1).max(100)).max(MAX_INTAKE_SERIALS).default([]),
});
export type ShipmentIntakeLine = z.infer<typeof ShipmentIntakeLine>;

/** 제조사·포워더가 B/L 과 시리얼 목록을 제출한 한 건. 발주 번호가 들어 있다. */
export const ShipmentIntakeItem = z.object({
  /** 제출된 발주 번호 그대로. 모르는 번호여도 거부하지 않고 기록한다. */
  poNumber: z.string().min(1).max(100),
  blNumber: z.string().min(1).max(100),
  invoiceNumber: z.string().min(1).max(100).nullable().default(null),
  shipper: z.string().min(1).max(200),
  mode: ShipmentMode,
  shipDate: IsoDate.nullable().default(null),
  eta: IsoDate.nullable().default(null),
  /** 업체가 보고한 시각. 없으면 우리가 받은 시각. */
  reportedAt: IsoDateTime.nullable().default(null),
  lines: z.array(ShipmentIntakeLine).min(1).max(500),
  source: z.object({
    system: z.string().min(1).max(100),
    ref: z.string().max(200).nullable().default(null),
  }),
  /** 같은 제출이 다시 와도 한 번만 기록되게 하는 키. */
  idempotencyKey: z.string().min(1).max(200).optional(),
  note: z.string().min(1).max(500).nullable().default(null),
});
export type ShipmentIntakeItem = z.infer<typeof ShipmentIntakeItem>;
/** 기본값이 채워지기 전, 호출하는 쪽이 보내는 형태. */
export type ShipmentIntakeInput = z.input<typeof ShipmentIntakeItem>;

/** 선적 제출을 한꺼번에 기록한다 (한 트랜잭션). 모르는 SKU 가 하나라도 있으면 전부 기록하지 않는다. */
export const IntakeShipmentsRequest = z
  .object({ shipments: z.array(ShipmentIntakeItem).min(1).max(200) })
  .refine(
    ({ shipments }) =>
      shipments.reduce(
        (sum, shipment) =>
          sum + shipment.lines.reduce((lineSum, line) => lineSum + line.serialNumbers.length, 0),
        0,
      ) <= MAX_INTAKE_SERIALS,
    { message: `At most ${MAX_INTAKE_SERIALS} serial numbers per request` },
  );
export type IntakeShipmentsRequest = z.infer<typeof IntakeShipmentsRequest>;

/** 발주에 연결되지 않은 선적을 운영자가 발주에 연결한다. */
export const LinkShipmentRequest = z.object({
  poNumber: z.string().min(1).max(100),
  actor: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
});
export type LinkShipmentRequest = z.infer<typeof LinkShipmentRequest>;

/** `GET /shipments` 의 쿼리. `poNumber` 는 연결된 발주, `unlinked=true` 는 아직 발주에 연결되지 않은 선적. */
export const ShipmentListQuery = z.object({
  poNumber: z.string().min(1).max(100).optional(),
  unlinked: z.stringbool().optional(),
});
export type ShipmentListQuery = z.infer<typeof ShipmentListQuery>;

// ---------- HTTP 응답 ----------

export interface ShipmentAnomalyView {
  code: ShipmentAnomalyCode;
  message: string;
  /** 이상이 가리키는 선적 줄 번호(1부터). 선적 전체에 대한 이상이면 null. */
  lineNo: number | null;
}

export interface IntakeShipmentsResult {
  /** 요청의 shipments 와 같은 순서. */
  shipments: {
    shipmentNo: string;
    /** 같은 idempotencyKey 의 선적이 이미 있어 새로 기록하지 않았다. */
    duplicate: boolean;
    /** 연결된 발주 번호. 발주 미연결이면 null. */
    poNumber: string | null;
    anomalies: ShipmentAnomalyView[];
  }[];
}

export interface ShipmentSummaryView {
  /** 발주에 연결되면 `<발주 번호>-R<n>`, 연결되지 않았으면 `UNLINKED-<식별자>`. */
  shipmentNo: string;
  poNumber: string | null;
  /** 제출된 발주 번호 그대로. */
  reportedPoNumber: string;
  blNumber: string;
  invoiceNumber: string | null;
  shipper: string;
  mode: ShipmentMode;
  shipDate: string | null;
  eta: string | null;
  source: { system: string; ref: string | null };
  reportedAt: string;
  recordedAt: string;
  lineCount: number;
  totalQty: number;
  serialCount: number;
  /** 지금 유효한 이상의 수. */
  anomalyCount: number;
}

export interface ShipmentLineView {
  lineNo: number;
  sku: string;
  quantity: number;
  lotNo: string | null;
  /** 연결된 발주 줄 번호. 연결되지 않았으면 null. */
  poLineNo: number | null;
  serialCount: number;
}

/** 운영자의 연결 기록. 연결 전의 번호와 연결 시점에 찾은 이상이 남는다. */
export interface ShipmentLinkView {
  previousShipmentNo: string;
  poNumber: string;
  actor: string;
  reason: string;
  linkedAt: string;
  anomalies: ShipmentAnomalyView[];
}

export interface ShipmentDetailView extends ShipmentSummaryView {
  note: string | null;
  lines: ShipmentLineView[];
  /** 지금 유효한 이상: 받을 때 찾은 이상 가운데 연결로 해소된 것을 빼고 연결 시점의 이상을 더한 것. */
  anomalies: ShipmentAnomalyView[];
  link: ShipmentLinkView | null;
}
