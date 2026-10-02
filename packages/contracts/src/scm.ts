import { z } from 'zod';

import { defineEvent, IsoDateTime, OrderRef } from './common.js';

/** 물리 제품(시리얼 단위)에 일어날 수 있는 사실의 종류. */
export const UnitEventType = z.enum([
  'MANUFACTURED', // 제조 완료
  'DISPATCHED', // 거점에서 다른 거점으로 출발
  'RECEIVED', // 입고
  'STORED', // 적재(로케이션 확정)
  'SHIPPED', // 고객 주문으로 출고
  'DELIVERED', // 배송 완료
  'RETURN_RECEIVED', // 회수 입고
  'DOA_CONFIRMED', // 초기 불량 확정
  'SCRAPPED', // 폐기
]);
export type UnitEventType = z.infer<typeof UnitEventType>;

export const UnitStatus = z.enum([
  'UNKNOWN',
  'PRODUCED',
  'IN_TRANSIT',
  'IN_STOCK',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'DOA',
  'SCRAPPED',
]);
export type UnitStatus = z.infer<typeof UnitStatus>;

export const LocationType = z.enum(['FACTORY', 'WAREHOUSE', 'SERVICE_CENTER']);
export type LocationType = z.infer<typeof LocationType>;

// ---------- HTTP 요청 ----------

export const RegisterProductRequest = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
});
export type RegisterProductRequest = z.infer<typeof RegisterProductRequest>;

export const RegisterLocationRequest = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  type: LocationType,
  partner: z.string().min(1).max(100),
});
export type RegisterLocationRequest = z.infer<typeof RegisterLocationRequest>;

/** 업체(또는 연동 어댑터)가 보고하는 사실 한 건. */
export const RecordUnitEventRequest = z.object({
  serialNumber: z.string().min(1).max(100),
  /** 처음 보는 시리얼이면 필수. */
  sku: z.string().min(1).max(64).optional(),
  type: UnitEventType,
  occurredAt: IsoDateTime,
  locationCode: z.string().min(1).max(64).nullable().default(null),
  orderRef: OrderRef.nullable().default(null),
  caseId: z.string().min(1).nullable().default(null),
  source: z.object({
    system: z.string().min(1).max(100),
    ref: z.string().max(200).nullable().default(null),
  }),
  /** 같은 보고가 재전송되어도 한 번만 기록되게 하는 키. */
  idempotencyKey: z.string().min(1).max(200).optional(),
  note: z.string().max(500).nullable().default(null),
});
export type RecordUnitEventRequest = z.infer<typeof RecordUnitEventRequest>;

/** 잘못 보고된 사실을 무효화하고, 필요하면 올바른 사실로 대체한다. */
export const CorrectUnitEventRequest = z.object({
  reason: z.string().min(1).max(500),
  actor: z.string().min(1).max(100),
  replacement: z
    .object({
      type: UnitEventType,
      occurredAt: IsoDateTime,
      locationCode: z.string().min(1).max(64).nullable().default(null),
      orderRef: OrderRef.nullable().default(null),
    })
    .nullable()
    .default(null),
});
export type CorrectUnitEventRequest = z.infer<typeof CorrectUnitEventRequest>;
/** 기본값이 채워지기 전, 호출하는 쪽이 보내는 형태. */
export type CorrectUnitEventInput = z.input<typeof CorrectUnitEventRequest>;

// ---------- HTTP 응답 ----------

export interface ProductView {
  sku: string;
  name: string;
}
export interface LocationView {
  code: string;
  name: string;
  type: LocationType;
  partner: string;
}
export interface UnitEventView {
  id: string;
  type: UnitEventType;
  occurredAt: string;
  recordedAt: string;
  locationCode: string | null;
  orderRef: OrderRef | null;
  caseId: string | null;
  source: { system: string; ref: string | null };
  note: string | null;
  /** 이 사실이 정정으로 무효화되었으면 그 내역. null 이면 현재 유효한 사실. */
  correction: {
    id: string;
    reason: string;
    actor: string;
    recordedAt: string;
    replacementEventId: string | null;
  } | null;
}
export interface UnitLifecycleView {
  serialNumber: string;
  sku: string;
  status: UnitStatus;
  locationCode: string | null;
  orderRef: OrderRef | null;
  /** 유효한 사실들을 순서대로 놓았을 때 말이 안 되는 지점. 거부하지 않고 표시만 한다. */
  anomalies: string[];
  events: UnitEventView[];
}
export interface StockRow {
  sku: string;
  locationCode: string | null;
  status: UnitStatus;
  quantity: number;
}

// ---------- 통합 이벤트 (topic: scm.unit-events) ----------

const unitEventPayload = z.object({
  eventId: z.string(),
  serialNumber: z.string(),
  sku: z.string(),
  eventType: UnitEventType,
  occurredAt: IsoDateTime,
  locationCode: z.string().nullable(),
  orderRef: OrderRef.nullable(),
  caseId: z.string().nullable(),
});

export const UnitEventRecorded = defineEvent('scm.unit.event-recorded', unitEventPayload);
export type UnitEventRecorded = z.infer<typeof UnitEventRecorded>;

export const UnitEventVoided = defineEvent(
  'scm.unit.event-voided',
  unitEventPayload.extend({ reason: z.string(), replacementEventId: z.string().nullable() }),
);
export type UnitEventVoided = z.infer<typeof UnitEventVoided>;

export const ScmUnitMessage = z.discriminatedUnion('type', [UnitEventRecorded, UnitEventVoided]);
export type ScmUnitMessage = z.infer<typeof ScmUnitMessage>;
