# 3. 아키텍처

## 서비스

```
            ┌────────┐        ┌─────────┐        ┌────────┐
 채널 ─────▶│ oms-api│        │ scm-api │◀────── 업체 보고 (연동 어댑터)
            └───┬──▲─┘        └──▲───┬──┘
                │  │             │   │           ┌────────┐
                │  └─ scm.unit-events ◀──────────│        │
                │                │               │ as-api │◀── AS 담당자
                └─ oms.order-events              │        │
                                 └── as.case-events ◀─────┘
                         (oms-api 도 as.case-events 를 구독)
```

- 서비스마다 DB 가 따로 있다 (`lh_scm`, `lh_oms`, `lh_as`). 서로의 테이블을 읽지 않는다.
- 서비스 간 통신은 **이벤트뿐**이다. 동기 HTTP 호출이 없어서 한 서비스가 내려가도 나머지는 계속 일하고,
  올라오면 밀린 이벤트를 처리한다.
- 웹 콘솔은 개발 서버 프록시로 `/api/scm`, `/api/oms`, `/api/as` 를 각 서비스에 넘긴다.

## 메시징

서비스 코드는 `MessageBus` 인터페이스만 안다 ([message-bus.ts](../packages/messaging/src/message-bus.ts)).

```ts
interface MessageBus {
  publish(topic, { key, value }): Promise<void>;
  subscribe(topic, group, handler): Promise<void>;
  close(): Promise<void>;
}
```

의미는 Kafka 에 맞췄다: 토픽, 컨슈머 그룹, 파티션 키, at-least-once.
지금 구현은 **Redis Streams** 다. 스트림 = 토픽, 컨슈머 그룹 = 컨슈머 그룹으로 1:1 대응해서
Kafka 로 옮길 때 `KafkaMessageBus` 클래스 하나를 추가하고 `InfraModule` 의 생성 부분만 바꾸면 된다.

| 토픽               | 내는 곳 | 받는 곳          | 메시지                                             |
| ------------------ | ------- | ---------------- | -------------------------------------------------- |
| `scm.unit-events`  | scm-api | oms-api          | `scm.unit.event-recorded`, `scm.unit.event-voided` |
| `oms.order-events` | oms-api | (창고 연동 예정) | `oms.fulfillment.requested`                        |
| `as.case-events`   | as-api  | scm-api, oms-api | `as.doa.confirmed`, `as.unit.scrapped`             |

### 유실과 중복을 막는 방법

**내보낼 때 — 트랜잭셔널 아웃박스.** 서비스는 브로커에 직접 발행하지 않는다. 업무 데이터를 바꾸는 트랜잭션 안에서
`outbox_events` 테이블에 이벤트를 적고, 커밋된 것만 `OutboxRelay` 가 순서대로 발행한다.
"DB 는 바뀌었는데 이벤트는 안 나간" 상태가 생기지 않는다.

**받을 때 — 멱등 처리.** 같은 메시지가 두 번 올 수 있다. 모든 이벤트는 고유 `id` 를 가지며,
OMS 는 `processed_messages` 에 처리한 id 를 업무 변경과 같은 트랜잭션으로 기록하고,
SCM 은 이벤트 id 를 `unit_events.idempotency_key` 로 쓴다.

## 패키지 의존 방향

```
apps/*-api ──▶ nest-kit ──▶ db-kit ──▶ messaging
     │
     └──▶ contracts ◀── apps/web
```

- `contracts` 는 zod 만 의존한다. 서버는 스키마로 요청을 검증하고, 웹은 같은 파일의 타입으로 응답을 다룬다.
- 패키지는 `tsc` 로 `dist` 에 빌드한 결과를 파일 단위 서브경로(`@repo/db-kit/outbox`)로 내보낸다. 배럴 파일은 없다. turbo 가 `^build` 로 순서를 맞춘다.

## 서비스 내부 구조

기능별 폴더 하나에 컨트롤러·서비스·순수 도메인 함수를 둔다.

```
apps/scm-api/src/
  db/schema.ts              테이블 정의 (Drizzle)
  units/
    unit-projection.ts      사실 → 상태. 순수 함수, DB 없이 테스트
    units.service.ts        트랜잭션, 아웃박스
    units.controller.ts     HTTP + zod 검증
  integration/              다른 서비스 이벤트 구독
```

판단 규칙(상태 전이, 패키지 분해, 출고 항목 매칭)은 순수 함수로 빼서 단위 테스트하고,
서비스 클래스는 "읽고, 규칙 적용하고, 쓰고, 이벤트 적는" 흐름만 가진다.
