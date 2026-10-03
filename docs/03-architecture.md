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
  `device-api`(3004)는 DB 가 없는 **모의 기기 서버**다. 실제 기기 서버를 대신해 scm-api 와 HTTP 로만 말한다 ([기기 서버 연동](#기기-서버-연동)).
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

`REDIS_URL` 이 비어 있으면 `InMemoryMessageBus` 를 쓴다 (테스트, 브로커 없는 단독 실행).
프로세스 안에서만 전달되므로 서비스 셋이 한 브로커를 공유해야 하는 실제 흐름은 재현하지 못한다.
의미는 Redis 모드와 같게 맞춰 두었다: `publish` 는 큐에 넣고 바로 돌아오고, 핸들러는 다음 이벤트 루프 턴에
토픽+그룹마다 순서대로(한 번에 하나) 실행된다. 핸들러가 던지면 발행자에게 전파하지 않고 로그만 남긴 뒤
같은 메시지를 잠시 후 다시 시도한다(ack 안 함 = 재전달). 발행자의 트랜잭션 안에서 핸들러가 돌지 않는 것이 중요하다 —
그렇게 하면 `OutboxRelay` 가 발행하는 동안 핸들러가 아웃박스에 적으려다 서로 기다리게 된다
(`packages/db-kit/src/outbox.integration.spec.ts` 가 실제 MySQL 로 이를 확인한다). 큐는 메모리에만 있어 프로세스가 죽으면 사라진다.

| 토픽                  | 내는 곳 | 받는 곳             | 메시지                                             |
| --------------------- | ------- | ------------------- | -------------------------------------------------- |
| `scm.unit-events`     | scm-api | oms-api             | `scm.unit.event-recorded`, `scm.unit.event-voided` |
| `oms.order-events`    | oms-api | (창고 연동 예정)    | `oms.fulfillment.requested`                        |
| `as.case-events`      | as-api  | scm-api, oms-api    | `as.doa.confirmed`, `as.unit.scrapped`             |
| `scm.device-requests` | scm-api | scm-api (자기 자신) | `scm.device-request.created`                       |

### 기기 서버 연동

제품 등록·비활성화는 **기기 서버**(기기 활성화 등을 처리하는 별도 API 서버)가 처리한다. 허브 서비스끼리와 달리 외부 시스템이라 HTTP 로 말하되, 유실되지 않게 아웃박스를 거친다. 설계 근거는 [06-inbound-design.md](06-inbound-design.md) 의 "기기 서버와의 연동".

1. 기기 요청(`device_requests` + 항목)을 만드는 트랜잭션에 `scm.device-request.created {requestId, type, count}` 를 아웃박스로 같이 적는다.
2. scm-api 의 `DeviceRequestsConsumer` 가 받아 `POST {DEVICE_API_URL}/device-requests {requestId, type, count}` 를 부른다. 2xx 가 아니거나 연결에 실패하면 던져서 확인 처리하지 않으므로 다시 시도된다. 성공하면 `notified_at` 을 적는다 (이미 적혀 있으면 아무것도 하지 않아 멱등). HTTP 호출은 DB 트랜잭션 밖에서 한다.
3. 기기 서버가 `GET /device-requests/:id/units?cursor=&limit=` 로 시리얼을 항목 id 순서의 커서로 페이지씩(기본 500, 최대 1000) 가져가고, `POST /device-requests/:id/results` 로 시리얼별 `SUCCEEDED`/`FAILED` 를 돌려준다 (같은 시리얼은 마지막 값이 이김, 요청에 없는 시리얼이 섞이면 `422 DEVICE_REQUEST_UNKNOWN_SERIAL` 로 통째로 거절).
4. 운영자는 `GET /device-requests`(최근 50건과 집계), `GET /device-requests/:id`(요약과 실패 항목)로 본다.

기기 서버는 같은 `requestId` 알림을 두 번 받아도 한 번만 처리해야 한다 (연동 계약). 모의 구현은 `apps/device-api` — `FAIL_SERIAL_SUFFIX` 로 끝나는 시리얼을 실패로 보고한다.

### 유실과 중복을 막는 방법

**내보낼 때 — 트랜잭셔널 아웃박스.** 서비스는 브로커에 직접 발행하지 않는다. 업무 데이터를 바꾸는 트랜잭션 안에서
`outbox_events` 테이블에 이벤트를 적고, 커밋된 것만 `OutboxRelay` 가 순서대로 발행한다.
"DB 는 바뀌었는데 이벤트는 안 나간" 상태가 생기지 않는다.
릴레이는 브로커가 받은 뒤에만 `published_at` 을 찍고(그 사이 죽으면 다시 보냄 = at-least-once),
인스턴스끼리는 행 잠금이 아니라 MySQL 이름 잠금(`GET_LOCK`)으로 배타해서 발행하는 동안 아웃박스에 적는 트랜잭션을 막지 않는다.

**받을 때 — 멱등 처리.** 같은 메시지가 두 번 올 수 있다. 모든 이벤트는 고유 `id` 를 가지며,
OMS 는 `processed_messages` 에 처리한 id 를 업무 변경과 같은 트랜잭션으로 기록하고,
SCM 은 이벤트 id 를 `unit_events.idempotency_key` 로 쓴다.

## 에러 응답

모든 서비스의 에러 응답은 같은 모양이고 **`code` 는 항상 있다.**

```json
{ "code": "UNIT_NOT_FOUND", "message": "Unit SN-1 not found", "details": null }
```

- `code` — 문자열 에러 코드. 호출하는 쪽은 이것으로만 분기한다.
- `message` — 사람이 읽을 보조 설명. **없을 수 있고 문구가 바뀔 수 있다.** 분기에 쓰지 않는다.
- `details` — 코드별 부가 정보. 없을 수 있다. (`VALIDATION_FAILED` 는 필드별 사유 목록)

코드는 두 층이다.

| 층          | 정의 위치                                                             | 예                                                                |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 공통        | `@repo/contracts/common` 의 `CommonErrorCode`                         | `VALIDATION_FAILED` `NOT_FOUND` `INTERNAL_ERROR`                  |
| 서비스 고유 | 각 서비스 규격 파일의 `ScmErrorCode` · `OmsErrorCode` · `AsErrorCode` | `UNIT_EVENT_ALREADY_CORRECTED` `UNKNOWN_SELLABLE` `CASE_NOT_OPEN` |

코드 목록은 서비스의 공개 규격이므로 `contracts` 에 있고, 코드와 HTTP 상태를 묶는 표는 각 앱의 `src/errors.ts` 에 있다.
`defineErrors<ScmErrorCode>({...})` 는 모든 코드에 상태가 있어야 컴파일되므로 코드를 추가하고 상태를 빠뜨릴 수 없다.

코드 없는 응답이 나가지 않게 하는 장치는 셋이다.

1. 서비스 코드는 `scmError('UNIT_NOT_FOUND', ...)` 처럼 자기 앱의 에러 함수로만 던진다. 코드 인자가 타입으로 강제된다.
2. Nest 내장 HTTP 예외(`NotFoundException` 등)는 앱에서 import 하면 린트 오류다.
3. 전역 필터(`ApiErrorFilter`, `@repo/nest-kit`)가 나머지를 받아 아래 표대로 바꾼다. 변환 자체는 순수 함수 `toErrorResponse` 다.

### 프레임워크 예외의 변환

서비스 코드가 아니라 Nest·Express 가 던지는 예외(없는 경로, 깨진 JSON 본문, 너무 큰 본문 등)는 **HTTP 상태를 그대로 두고** 상태별 공통 코드를 붙인다.

| HTTP 상태                                                   | 코드                                                                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 401 403 404 405 406 408 409 413 415 422 429             | `BAD_REQUEST` `UNAUTHORIZED` `FORBIDDEN` `NOT_FOUND` `METHOD_NOT_ALLOWED` `NOT_ACCEPTABLE` `REQUEST_TIMEOUT` `CONFLICT` `PAYLOAD_TOO_LARGE` `UNSUPPORTED_MEDIA_TYPE` `UNPROCESSABLE_ENTITY` `TOO_MANY_REQUESTS` |
| 그 밖의 4xx                                                 | `BAD_REQUEST` (상태는 원래 값)                                                                                                                                                                                  |
| 503 504                                                     | `SERVICE_UNAVAILABLE` `GATEWAY_TIMEOUT`                                                                                                                                                                         |
| 그 밖의 5xx, `HttpException` 이 아닌 예외, Error 가 아닌 값 | `INTERNAL_ERROR` (500)                                                                                                                                                                                          |

- **4xx** 는 사람이 읽을 설명을 전달한다. `HttpException.getResponse()` 가 문자열이면 `message`, 객체면 그 `message` 필드만 쓴다.
  `message` 가 문자열 배열이면 `details` 에 싣고 `message` 는 생략한다. `statusCode`·`error` 같은 다른 필드는 내보내지 않는다.
- **5xx** 는 `code` 만 내보낸다. 예외의 메시지·스택은 서버 로그에만 남는다 (접속 문자열 같은 내부 정보가 새지 않게).
  서비스가 `errors.ts` 로 던진 5xx 는 의도한 응답이라 `message`·`details` 를 그대로 둔다.
- Express 본문 파서는 `HttpException` 이 아니라 `http-errors` 꼴의 에러(413 `request entity too large` 등)를 던진다. 필터가 이것도 상태로 알아본다.
- 실제 동작 (scm-api 로 확인): 없는 경로 → `404 NOT_FOUND`, 깨진 JSON → `400 BAD_REQUEST`, 1MB 넘는 본문 → `413 PAYLOAD_TOO_LARGE` (scm-api 는 제품 등록 명령이 시리얼을 5000개까지 받아 JSON 본문 한도를 기본 100KB 에서 1MB 로 올렸다),
  있는 경로에 없는 메서드 → Express 는 405 가 아니라 `404 NOT_FOUND` ("Cannot DELETE /products"), zod 실패 → `400 VALIDATION_FAILED` + `details`,
  DB 연결 실패 → `500 { "code": "INTERNAL_ERROR" }`.

필터의 로그: 5xx 는 `error` 수준으로 스택과 요청 ID·method·path 를, 4xx 는 `debug` 수준으로 스택 없이 남긴다.
4xx 는 요청 로그에 이미 상태와 요청 ID 가 한 줄 있고 클라이언트의 잘못이라 `warn` 으로 두면 소음이 된다. 조사할 때 `LOG_LEVEL=debug` 로 올리면 코드와 메시지가 보인다.

## 설정

설정은 `@nestjs/config` 의 **타입 있는 네임스페이스**로만 읽는다. `ConfigService.get('...')` 문자열 조회와 앱 코드의 `process.env` 는 린트가 막는다.

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { databaseConfig } from '@repo/nest-kit/config';

@Injectable()
export class SomeService {
  constructor(
    @Inject(databaseConfig.KEY) private readonly database: ConfigType<typeof databaseConfig>,
  ) {}
  // this.database.url
}
```

| 네임스페이스             | 환경변수                                             | 값                                                                       |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `httpConfig`             | `PORT`                                               | `{ port }`                                                               |
| `databaseConfig`         | `DATABASE_URL` (mysql://)                            | `{ url }`                                                                |
| `messagingConfig`        | `REDIS_URL` (redis(s)://, 선택)                      | `{ redisUrl }` — 없으면 프로세스 내부 버스 (다른 서비스로 전달되지 않음) |
| `logConfig`              | `LOG_LEVEL` (기본 `log`), `LOG_FORMAT` (기본 `text`) | `{ level, format }`                                                      |
| `deviceConfig` (scm-api) | `DEVICE_API_URL` (기본 `http://localhost:3004`)      | `{ apiUrl }` — 기기 서버 주소                                            |

- 세 서비스의 모양이 같아 네임스페이스는 `@repo/nest-kit/config` 에 한 번만 있다. 서비스마다 다른 기본값(포트, DB 이름)은 `AppModule` 에서
  `serviceConfigModule({ defaults: { PORT: 3001, DATABASE_URL: '...' } })` 로 넘긴다.
- **우선순위**: 프로세스 환경변수 > 실행 디렉터리(`apps/<service>`)의 `.env` > `defaults` > 스키마의 기본값. 빈 값(`PORT=`)은 기본값으로 넘어가지 않고 오류다 (`REDIS_URL=` 만 "없음"으로 본다).
- 기동 때 모든 네임스페이스를 한 번에 검증하고, 잘못된 변수를 전부 나열한 `ConfigError` 로 멈춘다.
- DB 가 없는 서비스(`device-api`)는 `defaults` 에 `DATABASE_URL` 을 주지 않는다. 그러면 `database`·`messaging` 네임스페이스를 등록하지 않고 `http`·`log` 만 읽는다.
- 서비스 고유 네임스페이스는 같은 함수로 만들고 `load` 로 넣는다. 스키마에 기본값을 두면 `.env` 없이도 뜬다.

  ```ts
  // apps/scm-api/src/carrier.config.ts
  export const carrierConfig = defineConfig(
    'carrier',
    z.object({ CARRIER_API_URL: z.url(), CARRIER_TIMEOUT_MS: z.coerce.number().default(3000) }),
    (env) => ({ apiUrl: env.CARRIER_API_URL, timeoutMs: env.CARRIER_TIMEOUT_MS }),
  );
  // app.module.ts: serviceConfigModule({ defaults, load: [carrierConfig] })
  ```

- `drizzle.config.ts` 는 Nest 밖에서 돌아 `process.env` 를 직접 읽는다.

## 로그

- 로거는 프로세스에 하나다. `LoggerModule`(`@repo/nest-kit/logger.module`)이 `logConfig` 로 설정한 `AppLogger`(Nest 내장 `ConsoleLogger`)를 제공하고,
  `main.ts` 가 `app.useLogger(app.get(AppLogger))` 로 설치한다. `bufferLogs: true` 라 기동 로그도 이 로거로 나온다.
- **클래스는 `private readonly logger = new Logger(클래스.name)`** (`@nestjs/common`) 으로 남긴다. 이 `Logger` 는 설치된 `AppLogger` 로 넘겨 주는 얇은 창구다.
  `ConsoleLogger` 를 앱 코드에서 만들거나 주입하지 않는다 (린트가 막는다).
- `LOG_FORMAT=json` 이면 한 줄 JSON(`level`, `pid`, `timestamp`, `message`, `context`, 그리고 메시지 뒤에 넘긴 객체의 필드), 아니면 사람이 읽는 텍스트다.
  `LOG_LEVEL` 은 그 수준 이상만 남긴다 (`verbose` < `debug` < `log` < `warn` < `error` < `fatal`).
- **요청 로그** (`accessLog`, `main.ts` 에서 `app.use`): 요청마다 `GET /units/SN-1 200 3ms` 한 줄과 `requestId`·`method`·`path`·`status`·`durationMs`. `/health` 는 남기지 않고, 쿼리 문자열도 남기지 않는다.
- **요청 ID**: 클라이언트가 보낸 `x-request-id` 가 `[A-Za-z0-9_.-]{1,64}` 이면 그대로, 아니면 UUID 를 만든다. 응답 헤더 `x-request-id` 로 돌려주고 요청 로그와 에러 로그에 싣는다.

## 패키지 의존 방향

```
apps/*-api ──▶ nest-kit ──▶ db-kit ──▶ messaging
     │
     └──▶ contracts ◀── apps/web
```

- `contracts` 는 zod 만 의존한다. 서버는 스키마로 요청을 검증하고, 웹은 같은 파일의 타입으로 응답을 다룬다.
- 패키지는 `tsc` 로 `dist` 에 빌드한 결과를 파일 단위 서브경로(`@repo/db-kit/outbox`)로 내보낸다. 배럴 파일은 없다. turbo 가 `^build` 로 순서를 맞춘다.

## 서비스 내부 구조

도메인 단위 모듈(`domains/<도메인>/{domain,application,infra}`)과, 도메인에 속하지 않는 `usecases/`, `presentation/` 으로 나눈다.

```
apps/scm-api/src/
  db/schema.ts                        테이블 정의 전체 (Drizzle)
  domains/unit/
    domain/unit-projection.ts         사실 → 상태. 순수 함수, DB 없이 테스트
    domain/unit.repository.ts         repository 인터페이스 + 토큰
    application/unit.service.ts       한 도메인 안의 읽고·규칙 적용하고·쓰고·이벤트 적는 흐름
    infra/drizzle-unit.repository.ts  Drizzle 구현
  usecases/record-unit-event.usecase.ts   요청 하나의 처리 전체. 트랜잭션 경계, 여러 도메인을 엮음
  presentation/api/units.controller.ts    HTTP + zod 검증 → usecase
  presentation/consumer/as-case-events.consumer.ts   이벤트 검증 → usecase
```

호출 방향은 presentation → usecases → application → domain ← infra 하나뿐이고 린트로 강제한다.
규칙 전문은 [architecture-rules.md](architecture-rules.md).
