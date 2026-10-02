import { z } from 'zod';

/** 서비스 간 메시지 토픽. Kafka 로 옮겨도 이름을 그대로 쓴다. */
export const Topics = {
  scmUnitEvents: 'scm.unit-events',
  omsOrderEvents: 'oms.order-events',
  asCaseEvents: 'as.case-events',
} as const;

/** 물리 제품이 어느 주문의 어느 출고 단위로 나갔는지 가리키는 참조. */
export const OrderRef = z.object({
  orderId: z.string().min(1),
  fulfillmentItemId: z.string().min(1).nullable().default(null),
});
export type OrderRef = z.infer<typeof OrderRef>;

export const IsoDateTime = z.iso.datetime({ offset: true });

/** 모든 통합 이벤트의 공통 봉투. id 는 소비 측 멱등 처리의 키다. */
export const defineEvent = <T extends string, P extends z.ZodType>(type: T, payload: P) => {
  return z.object({
    id: z.uuid(),
    type: z.literal(type),
    emittedAt: IsoDateTime,
    payload,
  });
};

export const makeEvent = <T extends string, P>(type: T, payload: P) => {
  return { id: crypto.randomUUID(), type, emittedAt: new Date().toISOString(), payload };
};

/** 어느 서비스든 낼 수 있는 에러 코드. 서비스 고유 코드는 각 서비스의 규격 파일에 있다. */
export const CommonErrorCode = z.enum([
  'VALIDATION_FAILED', // 요청 형식이 스키마와 다름. details 에 필드별 사유
  'BAD_REQUEST', // 그 밖의 잘못된 요청 (본문 파싱 실패 등)
  'NOT_FOUND', // 없는 경로
  'INTERNAL_ERROR', // 서버 쪽 문제. 원인은 응답에 싣지 않는다
]);
export type CommonErrorCode = z.infer<typeof CommonErrorCode>;

/**
 * 모든 에러 응답의 본문. code 는 항상 있고, 호출하는 쪽은 code 로 분기한다.
 * message 는 사람이 읽을 보조 설명이라 없을 수 있고, 문구가 바뀔 수 있으니 분기에 쓰지 않는다.
 */
export interface ErrorResponse<TCode extends string = string> {
  code: TCode | CommonErrorCode;
  message?: string;
  details?: unknown;
}
