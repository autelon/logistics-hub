import type { FulfillmentItemStatus, FulfillmentReason, SellableKind } from '@repo/contracts/oms';

export interface Order {
  id: string;
  /** 외부에 보여 주는 주문 번호 (`ORD-2026-000123`). 내부 참조에는 쓰지 않는다. */
  publicId: string;
  channel: string;
  channelOrderNo: string;
  orderedAt: Date;
  createdAt: Date;
}

/** 고객이 주문한 그대로의 줄. 판매 상품 이름·종류는 주문 시점 값을 복사해 둔다. */
export interface OrderLine {
  id: string;
  orderId: string;
  lineNo: number;
  sellableCode: string;
  sellableName: string;
  sellableKind: SellableKind;
  quantity: number;
}

/**
 * 출고해야 할 물리 제품 한 개. 패키지 주문은 구성품 수만큼 이 항목으로 풀린다.
 * 출고가 보고되면 시리얼이 붙어 "어느 주문의 어느 패키지에 어떤 SN 이 나갔는지"가 된다.
 */
export interface FulfillmentItem {
  id: string;
  orderId: string;
  orderLineId: string;
  sku: string;
  status: FulfillmentItemStatus;
  reason: FulfillmentReason;
  /** DOA 교체 출고인 경우, 불량이었던 원래 항목. */
  replacesItemId: string | null;
  serialNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  doaCaseId: string | null;
  createdAt: Date;
}

/** 주문 하나와 그 줄·출고 항목 전부. 줄은 번호 순, 항목은 만든 순. */
export interface OrderDetail {
  order: Order;
  lines: OrderLine[];
  items: FulfillmentItem[];
}

/** 채널에서 받은 주문 중 저장할 머리 부분. id 와 publicId 는 저장할 때 발급된다. */
export interface NewOrder {
  channel: string;
  channelOrderNo: string;
  orderedAt: Date;
}

export interface NewFulfillmentItem {
  orderId: string;
  orderLineId: string;
  sku: string;
  status: FulfillmentItemStatus;
  reason: FulfillmentReason;
  replacesItemId: string | null;
}

export type FulfillmentItemPatch = Partial<
  Pick<FulfillmentItem, 'status' | 'serialNumber' | 'shippedAt' | 'deliveredAt' | 'doaCaseId'>
>;

/** SCM 이 알려 준 물리 제품의 출고·배송 사실, 또는 그 사실의 정정. 주문 참조가 있는 것만 여기까지 온다. */
export interface ShipmentReport {
  /** 사실이 새로 기록된 것인지(RECORDED), 잘못된 기록이 무효화된 것인지(VOIDED). */
  change: 'RECORDED' | 'VOIDED';
  event: 'SHIPPED' | 'DELIVERED';
  orderId: string;
  /** 업체가 어느 출고 항목인지 알려 준 경우. */
  fulfillmentItemId: string | null;
  serialNumber: string;
  sku: string;
  occurredAt: Date;
}
