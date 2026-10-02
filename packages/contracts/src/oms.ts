import { z } from 'zod';

import { defineEvent, IsoDateTime } from './common.js';

export const SellableKind = z.enum(['SINGLE', 'PACKAGE']);
export type SellableKind = z.infer<typeof SellableKind>;

export const FulfillmentItemStatus = z.enum([
  'PENDING',
  'SHIPPED',
  'DELIVERED',
  'DOA',
  'CANCELLED',
]);
export type FulfillmentItemStatus = z.infer<typeof FulfillmentItemStatus>;

export const FulfillmentReason = z.enum(['ORDER', 'DOA_REPLACEMENT']);
export type FulfillmentReason = z.infer<typeof FulfillmentReason>;

// ---------- 에러 코드 ----------

export const OmsErrorCode = z.enum(['ORDER_NOT_FOUND', 'UNKNOWN_SELLABLE']);
export type OmsErrorCode = z.infer<typeof OmsErrorCode>;

// ---------- HTTP 요청 ----------

/** 판매 상품. 단품이든 패키지든 "물리 SKU 몇 개로 이루어지는가"로 정의한다. */
export const UpsertSellableRequest = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  components: z
    .array(z.object({ sku: z.string().min(1).max(64), quantity: z.number().int().positive() }))
    .min(1),
});
export type UpsertSellableRequest = z.infer<typeof UpsertSellableRequest>;

/** 판매 채널(네이버 스마트스토어 등)에서 넘어오는 주문. 결제·환불 정보는 받지 않는다. */
export const IngestOrderRequest = z.object({
  channel: z.string().min(1).max(50),
  channelOrderNo: z.string().min(1).max(100),
  orderedAt: IsoDateTime,
  lines: z
    .array(z.object({ sellableCode: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1),
});
export type IngestOrderRequest = z.infer<typeof IngestOrderRequest>;

// ---------- HTTP 응답 ----------

export interface SellableView {
  code: string;
  name: string;
  kind: SellableKind;
  components: { sku: string; quantity: number }[];
}
export interface FulfillmentItemView {
  id: string;
  sku: string;
  status: FulfillmentItemStatus;
  reason: FulfillmentReason;
  replacesItemId: string | null;
  serialNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  doaCaseId: string | null;
}
export interface OrderLineView {
  id: string;
  lineNo: number;
  sellableCode: string;
  sellableName: string;
  sellableKind: SellableKind;
  quantity: number;
  items: FulfillmentItemView[];
}
export interface OrderView {
  id: string;
  channel: string;
  channelOrderNo: string;
  orderedAt: string;
  status: 'OPEN' | 'FULFILLED';
  lines: OrderLineView[];
}

// ---------- 통합 이벤트 (topic: oms.order-events) ----------

/** 출고해야 할 물리 단위 목록. 창고 연동 어댑터가 이걸 받아 업체 WMS 에 출고를 요청한다. */
export const FulfillmentRequested = defineEvent(
  'oms.fulfillment.requested',
  z.object({
    orderId: z.string(),
    channel: z.string(),
    channelOrderNo: z.string(),
    requestedAt: IsoDateTime,
    items: z.array(
      z.object({
        fulfillmentItemId: z.string(),
        sku: z.string(),
        reason: FulfillmentReason,
        replacesItemId: z.string().nullable(),
      }),
    ),
  }),
);
export type FulfillmentRequested = z.infer<typeof FulfillmentRequested>;

export const OmsOrderMessage = z.discriminatedUnion('type', [FulfillmentRequested]);
export type OmsOrderMessage = z.infer<typeof OmsOrderMessage>;
