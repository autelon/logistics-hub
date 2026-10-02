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
