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
  'REGISTERED', // 제품 등록(활성화 대상이 됨). 물리 상태는 바꾸지 않는다
]);
export type UnitEventType = z.infer<typeof UnitEventType>;

/** 물리 상태·위치를 바꾸는 사실. `REGISTERED` 는 물리 사실이 아니라 등록 여부 축의 사실이다. */
export type PhysicalUnitEventType = Exclude<UnitEventType, 'REGISTERED'>;

/** 제품의 추적 방식. SERIAL 만 개체 단위 이력(unit_events)으로 추적하고 등록 대상이다. */
export const TrackingMode = z.enum(['SERIAL', 'LOT', 'NONE']);
export type TrackingMode = z.infer<typeof TrackingMode>;

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

export const RegistrationExclusionReason = z.enum([
  'UNIT_NOT_FOUND', // 우리가 모르는 시리얼
  'NOT_SERIAL_TRACKED', // 제품이 시리얼 추적 방식이 아님
  'NOT_IN_STOCK', // 개체 상태가 IN_STOCK 이 아님
  'ALREADY_REGISTERED',
]);
export type RegistrationExclusionReason = z.infer<typeof RegistrationExclusionReason>;

/** 기기 서버에 보내는 요청의 종류. 등록과 비활성화는 서로 다른 처리라 요청을 따로 만든다. */
export const DeviceRequestType = z.enum(['REGISTER', 'DEACTIVATE']);
export type DeviceRequestType = z.infer<typeof DeviceRequestType>;

/** 요청 상태는 저장하지 않고 시리얼별 결과에서 계산한다. */
export const DeviceRequestStatus = z.enum([
  'NOT_NOTIFIED', // 아직 기기 서버에 알리지 못함
  'NOTIFIED', // 알렸고 결과는 아직 없음
  'IN_PROGRESS', // 일부 시리얼의 결과만 왔음
  'COMPLETED', // 모두 성공
  'PARTIALLY_FAILED', // 모두 처리되었고 실패가 있음
]);
export type DeviceRequestStatus = z.infer<typeof DeviceRequestStatus>;
/** 시리얼을 주지 않는 파트너의 개체를 "창고에 들어옴"으로 볼 단계. */
export const UnitReceiptTrigger = z.enum(['GOODS_RECEIPT', 'PUTAWAY']);
export type UnitReceiptTrigger = z.infer<typeof UnitReceiptTrigger>;

/**
 * 거점(파트너)의 능력 프로필: 무엇을 보고해 주고 무엇을 정하는가. 정책은 코드가 아니라 이 값이다.
 * 행이 없는 거점은 기본값(오늘의 운영)으로 동작한다. 의미는 docs/06-inbound-design.md.
 */
export const LocationPolicy = z.object({
  /** 입고 때 시리얼 목록을 준다. */
  reportsSerialsOnReceipt: z.boolean(),
  /** 출하(선적) 때 시리얼 목록을 준다. 공장에서 의미가 있다. */
  reportsSerialsOnShipment: z.boolean(),
  /** 출고 때 시리얼을 스캔해 준다. */
  reportsSerialsOnOutbound: z.boolean(),
  /** 검수 결과를 값(양품·불량·보류)으로 준다. */
  reportsInspectionResult: z.boolean(),
  /** 처분을 이 파트너가 정한다. */
  decidesDisposition: z.boolean(),
  /** 파트너 판정을 우리가 확정해야 실행으로 본다. */
  requiresHubConfirmation: z.boolean(),
  unitReceiptTrigger: UnitReceiptTrigger,
  /** 적치 사실이 들어오면 제품 등록을 자동으로 실행한다. */
  autoRegisterOnPutaway: z.boolean(),
});
export type LocationPolicy = z.infer<typeof LocationPolicy>;

// ---------- 에러 코드 ----------

export const ScmErrorCode = z.enum([
  'UNIT_NOT_FOUND',
  'UNIT_EVENT_NOT_FOUND',
  'UNIT_EVENT_ALREADY_CORRECTED',
  'UNKNOWN_LOCATION',
  'UNKNOWN_SKU',
  'SKU_REQUIRED', // 처음 보는 시리얼인데 sku 가 없음
  'SERIAL_SKU_MISMATCH', // 이미 다른 SKU 로 등록된 시리얼
  'DEVICE_REQUEST_NOT_FOUND',
  'DEVICE_REQUEST_UNKNOWN_SERIAL', // 결과에 그 기기 요청에 속하지 않는 시리얼이 있음. details 에 시리얼 목록
]);
export type ScmErrorCode = z.infer<typeof ScmErrorCode>;

// ---------- HTTP 요청 ----------

export const RegisterProductRequest = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  trackingMode: TrackingMode.default('SERIAL'),
});
export type RegisterProductRequest = z.infer<typeof RegisterProductRequest>;

export const RegisterLocationRequest = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  type: LocationType,
  partner: z.string().min(1).max(100),
});
export type RegisterLocationRequest = z.infer<typeof RegisterLocationRequest>;

/** 능력 프로필 변경. 보낸 항목만 바뀌고, 하나 이상 있어야 한다. 모르는 항목은 오타일 수 있어 거절한다. */
export const UpdateLocationPolicyRequest = LocationPolicy.partial()
  .extend({ actor: z.string().min(1).max(100) })
  .strict()
  .refine((body) => Object.keys(body).some((key) => key !== 'actor'), {
    message: 'At least one policy field is required',
  });
export type UpdateLocationPolicyRequest = z.infer<typeof UpdateLocationPolicyRequest>;

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

/** 제품 등록 명령. 시리얼 목록을 받아 등록할 수 있는 것만 등록하고 나머지는 사유와 함께 돌려준다. */
export const RegisterUnitsRequest = z.object({
  serialNumbers: z.array(z.string().min(1).max(100)).min(1).max(5000),
  /** 명령을 내린 운영자. 등록 사실의 처리자(source.ref)가 된다. */
  actor: z.string().min(1).max(100),
});
export type RegisterUnitsRequest = z.infer<typeof RegisterUnitsRequest>;

/** 기기 서버가 시리얼 목록을 페이지로 가져갈 때의 쿼리. cursor 는 이전 페이지가 준 nextCursor. */
export const DeviceRequestUnitsQuery = z.object({
  cursor: z.string().min(1).max(36).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type DeviceRequestUnitsQuery = z.infer<typeof DeviceRequestUnitsQuery>;

export const DeviceRequestItemResult = z.enum(['SUCCEEDED', 'FAILED']);
export type DeviceRequestItemResult = z.infer<typeof DeviceRequestItemResult>;

/** 기기 서버가 처리 결과를 돌려주는 요청. 같은 시리얼을 다시 보내면 마지막 값으로 덮어쓴다. */
export const ReportDeviceResultsRequest = z.object({
  items: z
    .array(
      z.object({
        serialNumber: z.string().min(1).max(100),
        result: DeviceRequestItemResult,
        reason: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(5000),
});
export type ReportDeviceResultsRequest = z.infer<typeof ReportDeviceResultsRequest>;
export type ReportDeviceResultsInput = z.input<typeof ReportDeviceResultsRequest>;

/** 우리가 기기 서버에 알리는 본문 (`POST <기기 서버>/device-requests`). 시리얼 목록은 기기 서버가 당겨 간다. */
export const DeviceRequestNotification = z.object({
  requestId: z.string().min(1),
  type: DeviceRequestType,
  count: z.number().int().min(0),
});
export type DeviceRequestNotification = z.infer<typeof DeviceRequestNotification>;

/** 시리얼 목록 한 페이지. 마지막 페이지면 nextCursor 가 null. */
export const DeviceRequestUnitsPage = z.object({
  items: z.array(z.object({ serialNumber: z.string(), sku: z.string() })),
  nextCursor: z.string().nullable(),
});
export type DeviceRequestUnitsPage = z.infer<typeof DeviceRequestUnitsPage>;

// ---------- HTTP 응답 ----------

export interface ProductView {
  sku: string;
  name: string;
  trackingMode: TrackingMode;
}
export interface LocationView {
  code: string;
  name: string;
  type: LocationType;
  partner: string;
  /** 능력 프로필. 저장된 행이 없으면 기본값이 채워져 있다. */
  policy: LocationPolicy;
}
/** 능력 프로필 변경 이력 한 건. before·after 는 기본값이 채워진 값이다. */
export interface LocationPolicyChangeView {
  id: string;
  actor: string;
  changedAt: string;
  before: LocationPolicy;
  after: LocationPolicy;
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
  /** 제품으로 등록된 시각. 등록되지 않았거나 등록 사실이 무효화되었으면 null. */
  registeredAt: string | null;
  /** 유효한 사실들을 순서대로 놓았을 때 말이 안 되는 지점. 거부하지 않고 표시만 한다. */
  anomalies: string[];
  events: UnitEventView[];
}
export interface StockRow {
  sku: string;
  locationCode: string | null;
  status: UnitStatus;
  /** 제품으로 등록되었는지(`REGISTERED` 사실이 유효한지). */
  registered: boolean;
  quantity: number;
}
export interface RegisterUnitsResult {
  /** 이번 명령으로 만든 기기 요청. 등록된 것이 하나도 없으면 null. */
  requestId: string | null;
  registered: string[];
  excluded: { serialNumber: string; reason: RegistrationExclusionReason }[];
}
export interface DeviceRequestCounts {
  total: number;
  pending: number;
  succeeded: number;
  failed: number;
}
export interface DeviceRequestView {
  id: string;
  type: DeviceRequestType;
  /** 요청을 만든 사실의 종류(`DOA_CONFIRMED` 등) 또는 `REGISTRATION`, `REGISTRATION_VOIDED`. */
  reason: string;
  createdBy: string;
  createdAt: string;
  notifiedAt: string | null;
  status: DeviceRequestStatus;
  counts: DeviceRequestCounts;
}
export interface DeviceRequestDetailView extends DeviceRequestView {
  failedItems: { serialNumber: string; sku: string; reason: string | null; resultAt: string }[];
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

// ---------- 통합 이벤트 (topic: scm.device-requests) ----------

/** 기기 요청이 만들어졌다. scm-api 자신이 받아 기기 서버에 알린다 (실패하면 재시도). */
export const DeviceRequestCreated = defineEvent(
  'scm.device-request.created',
  DeviceRequestNotification,
);
export type DeviceRequestCreated = z.infer<typeof DeviceRequestCreated>;
