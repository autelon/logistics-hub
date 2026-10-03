import type { ShipmentAnomalyCode, ShipmentMode } from '@repo/contracts/transport';

/**
 * 선적 보고에서 찾은 이상. 업체가 보고한 사실이라 거부하지 않고 표시한다.
 * 받을 때의 값을 shipments.anomalies 에 그대로 남기고, 연결로 해소된 것은 `currentAnomalies` 가 읽을 때 걸러 낸다.
 */
export interface ShipmentAnomaly {
  code: ShipmentAnomalyCode;
  message: string;
  /** 선적 줄 번호(1부터). 선적 전체에 대한 이상이면 null. */
  lineNo: number | null;
}

/**
 * 제조사·포워더가 알려 준 한 번의 출하. 보고된 값(reported_po_number, bl_number, 날짜, 줄, 시리얼)은 추가만 하고 고치지 않는다.
 * 우리가 해석한 값(`purchaseOrderId`, `shipmentNo`, 줄의 `purchaseOrderLineId`)만 운영자의 연결 명령으로 한 번 채워진다.
 */
export interface Shipment {
  id: string;
  /** 발주에 연결되면 `<발주 번호>-R<n>`, 아니면 `UNLINKED-<식별자>`. 연결 명령이 `UNLINKED-…` 를 차수 번호로 바꾼다. */
  shipmentNo: string;
  purchaseOrderId: string | null;
  /** 제출된 발주 번호 그대로. */
  reportedPoNumber: string;
  blNumber: string;
  invoiceNumber: string | null;
  shipper: string;
  mode: ShipmentMode;
  /** 달력 날짜(`YYYY-MM-DD`). */
  shipDate: string | null;
  eta: string | null;
  source: { system: string; ref: string | null };
  idempotencyKey: string | null;
  /** 업체가 보고한 시각. */
  reportedAt: Date;
  /** 우리가 기록한 시각. 같은 발주의 차수는 이 순서(도착 순서)로 매긴다. */
  recordedAt: Date;
  note: string | null;
  /** 받을 때 찾은 이상. 바뀌지 않는다. */
  anomalies: ShipmentAnomaly[];
}

export interface ShipmentLine {
  id: string;
  shipmentId: string;
  /** 1부터. 제출한 순서. */
  lineNo: number;
  purchaseOrderLineId: string | null;
  productId: string;
  shippedQty: number;
  lotNo: string | null;
  serialCount: number;
}

/** 운영자의 연결 기록. 추가만 하고 선적 하나에 하나뿐이다. */
export interface ShipmentLink {
  id: string;
  shipmentId: string;
  purchaseOrderId: string;
  previousShipmentNo: string;
  shipmentNo: string;
  actor: string;
  reason: string;
  linkedAt: Date;
  /** 어느 선적 줄을 어느 발주 줄에 맞췄는지. */
  lineLinks: { shipmentLineId: string; purchaseOrderLineId: string }[];
  /** 연결 시점에 발주 줄을 맞춰 보며 찾은 이상. */
  anomalies: ShipmentAnomaly[];
}

export interface ShipmentDetail {
  shipment: Shipment;
  lines: ShipmentLine[];
  link: ShipmentLink | null;
}

/** 저장 전의 선적 줄. id 는 repository 가 발급한다. */
export interface NewShipmentLine {
  lineNo: number;
  purchaseOrderLineId: string | null;
  productId: string;
  shippedQty: number;
  lotNo: string | null;
  /** 중복을 뺀 시리얼. 같은 줄에서 같은 시리얼은 한 번만 저장한다. */
  serialNumbers: string[];
}

/**
 * 저장 전의 선적. id 는 repository 가 발급한다.
 * `shipmentNo` 가 null 이면 repository 가 id 로 `UNLINKED-…` 를 만든다 (id 의 뒤쪽 무작위 부분을 쓴다).
 */
export type NewShipment = Omit<Shipment, 'id' | 'shipmentNo'> & {
  shipmentNo: string | null;
  lines: NewShipmentLine[];
};

/** 저장 전의 연결 기록. */
export type NewShipmentLink = Omit<ShipmentLink, 'id'>;

/** 목록 조회 조건. 둘 다 주면 둘 다 만족하는 것만 찾는다. */
export interface ShipmentFilter {
  purchaseOrderId?: string | undefined;
  unlinkedOnly?: boolean | undefined;
}
