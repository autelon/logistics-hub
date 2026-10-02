# 서비스 내부 구조 규칙

`apps/*-api` 의 코드를 어디에 두고 무엇이 무엇을 부를 수 있는지에 대한 규칙이다. 코드를 추가하거나 옮기기 전에 읽는다.
서비스 **사이**의 구조(이벤트, 아웃박스, 에러 응답)는 [03-architecture.md](03-architecture.md) 에 있다.

## 폴더

```
apps/<service>/src/
  main.ts  app.module.ts  errors.ts      설정은 env.ts 가 아니라 @repo/nest-kit/config 의 네임스페이스로 주입받는다
  db/schema.ts                      테이블 정의 전체 (drizzle-kit 이 읽는 단일 파일)
  domains/
    <domain>/
      domain/                       타입, 순수 함수, repository 인터페이스
      application/                  <이름>.service.ts
      infra/                        drizzle-<이름>.repository.ts
      <domain>.module.ts            이 도메인의 provider 를 묶고 application 서비스를 export
  usecases/
    <동사>-<대상>.usecase.ts         평평하게. 하위 폴더를 만들지 않는다
    usecases.module.ts
  presentation/
    api/<자원>.controller.ts         평평하게. URL 깊이를 폴더 깊이로 옮기지 않는다
    consumer/<토픽>.consumer.ts
    batch/<작업>.batch.ts
```

**도메인 단위로 모듈을 나누되, presentation 과 usecase 는 도메인에 넣지 않는다.**
API 하나, 이벤트 하나는 여러 도메인을 섞어 쓰는 것이 보통이라 특정 도메인의 것이라고 할 수 없기 때문이다.
도메인 폴더 안에 `presentation/` 이나 controller 를 만들지 않는다.

## 레이어의 책임

| 레이어         | 들어가는 것                                                                                         | 하지 않는 것                                                |
| -------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `domain`       | 타입, 상태 전이·계산 같은 순수 함수, repository 인터페이스                                          | I/O, Nest·Drizzle import, 다른 레이어 import                |
| `application`  | `*Service`. **도메인 하나 안에서** 읽고, domain 규칙을 적용하고, 저장하는 흐름                      | 다른 도메인 호출, 트랜잭션 시작, HTTP·메시지 형식을 아는 것 |
| `infra`        | repository 구현. Drizzle 쿼리, 행 ↔ 도메인 타입 변환                                                | 업무 규칙 판단                                              |
| `usecases`     | `*Usecase`. 외부 요청 하나에 대한 처리 전체. 여러 도메인의 서비스를 엮고 **트랜잭션 경계**를 잡는다 | 직접 쿼리, 상태 전이 규칙 구현                              |
| `presentation` | controller·consumer·batch. 입력 검증(zod), usecase 호출, 응답 형태로 변환                           | 업무 로직, application·infra 직접 호출                      |

판단 규칙이 어디 가야 할지 헷갈리면: I/O 없이 입력만으로 답이 나오면 `domain`, 한 도메인의 데이터를 읽고 써야 하면 `application`, 두 도메인 이상이 엮이면 `usecases`.

## 의존 방향

```
presentation ──▶ usecases ──▶ application ──▶ domain ◀── infra
```

| 이 레이어는    | import 할 수 있다                                                            | import 할 수 없다                                           |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `domain`       | 같은 도메인의 `domain`, `@repo/contracts` 의 **값 타입**(enum 류)            | 그 밖의 전부 (Nest, Drizzle, `db/schema`, 다른 도메인 포함) |
| `application`  | 같은 도메인의 `domain`, 공용 포트(`@repo/nest-kit`), `errors.ts`             | `infra`, 다른 도메인, `usecases`, `presentation`, Drizzle   |
| `infra`        | 같은 도메인의 `domain`, `db/schema`, Drizzle, `@repo/db-kit`                 | `application`, 다른 도메인, `usecases`, `presentation`      |
| `usecases`     | 모든 도메인의 `application` 과 `domain` 타입, `@repo/contracts`, `errors.ts` | `infra`, `presentation`, Drizzle                            |
| `presentation` | `usecases`, `@repo/contracts`, `@repo/nest-kit`                              | `domains/**`, Drizzle                                       |

- **presentation 은 항상 usecase 를 거친다.** 단순 조회도 예외가 아니다. 얇은 usecase 가 하나 생기는 비용보다 "언제 건너뛰어도 되나"를 매번 판단하는 비용이 크다.
- **도메인은 서로를 import 하지 않는다.** A 의 처리에 B 의 데이터가 필요하면 usecase 가 B 에서 읽어 A 에 넘긴다.
- 이 표는 린트(`no-restricted-imports`)로 강제한다. 린트를 끄거나 우회하지 않는다.
  규칙은 `.oxlintrc.json` 의 `overrides` 에 있고, import 경로 문자열을 정규식으로 검사한다. 그래서 잡지 못하는 것이 있다:
  - 다른 도메인 import 는 레이어 폴더 바로 아래 파일(`domains/<a>/domain/x.ts`)과 `<a>.module.ts` 에서만 빠짐없이 잡힌다.
    레이어 폴더 안에 하위 폴더를 만들면 `../../../<b>/...` 형태가 검사를 빠져나가므로 하위 폴더를 만들지 않는다.
  - `domain` 이 `@repo/contracts` 에서 값 타입이 아닌 것(요청·응답 타입)을 가져오는 것, `application` 이 `@repo/db-kit` 을 가져오는 것은 검사하지 않는다. 검토에서 본다.

## Repository

인터페이스는 `domain` 에, 구현은 `infra` 에 둔다. 인터페이스와 주입 토큰을 **같은 이름**으로 선언한다.

```ts
// domains/unit/domain/unit.repository.ts
export interface UnitRepository {
  findBySerial(serialNumber: string): Promise<Unit | undefined>;
  save(unit: Unit): Promise<void>;
}
export const UnitRepository = Symbol('UnitRepository');

// domains/unit/infra/drizzle-unit.repository.ts
@Injectable()
export class DrizzleUnitRepository implements UnitRepository { ... }

// domains/unit/unit.module.ts
providers: [UnitService, { provide: UnitRepository, useClass: DrizzleUnitRepository }]

// domains/unit/application/unit.service.ts
constructor(@Inject(UnitRepository) private readonly units: UnitRepository) {}
```

- 추상 클래스가 아니라 인터페이스를 쓴다. domain 에 런타임 구조물을 두지 않기 위해서이고, 토큰을 명시적으로 쓰면 `import type` 으로 잘못 가져와 주입이 조용히 깨지는 일이 없다.
- `namespace` 로 토큰을 묶지 않는다(`IUserRepository.Token` 형태). 같은 이름의 `const` 선언으로 충분하고, namespace 는 지워지지 않는 문법이다.
- `I` 접두사를 붙이지 않는다.
- repository 는 도메인 타입을 주고받는다. Drizzle 의 행 타입(`$inferSelect`)이 `infra` 밖으로 나가지 않게 한다.
- 조회 전용 쿼리(목록, 집계)도 repository 메서드로 둔다.

## 트랜잭션

- **트랜잭션은 usecase 가 연다.** `TransactionRunner` 를 주입받아 `this.tx.run(async () => { ... })` 로 감싼다.
- application 과 repository 는 트랜잭션을 인자로 받지 않는다. repository 는 `CurrentDb` 를 주입받아 쿼리할 때마다 `this.db.get()` 으로 현재 실행 컨텍스트의 연결을 얻는다. `run` 안에서 불리면 그 트랜잭션 핸들이, 밖이면 루트 연결(자동 커밋)이 나온다.
- 조회만 하는 usecase 는 `run` 으로 감싸지 않는다.
- `run` 안에서 `run` 을 또 부르면 새로 열지 않고 바깥 트랜잭션에 합류한다. 커밋·롤백은 가장 바깥 `run` 이 정한다.

포트는 모두 `InfraModule` 이 전역으로 제공한다. 인터페이스와 토큰이 같은 이름이므로 값 import(`import { X }`)로 가져온다.

| 포트                | import                              | 쓰는 레이어   |
| ------------------- | ----------------------------------- | ------------- |
| `TransactionRunner` | `@repo/nest-kit/transaction-runner` | `usecases`    |
| `CurrentDb`         | `@repo/nest-kit/current-db`         | `infra`       |
| `EventOutbox`       | `@repo/nest-kit/event-outbox`       | `application` |
| `MessageInbox`      | `@repo/nest-kit/message-inbox`      | `usecases`    |

```ts
// domains/unit/infra/drizzle-unit.repository.ts
import type * as schema from '../../../db/schema.js';

constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

async findBySerial(serialNumber: string) {
  const [row] = await this.db.get().select().from(units).where(eq(units.serialNumber, serialNumber));
  return row && toUnit(row);
}

// usecases/record-unit-event.usecase.ts
constructor(
  @Inject(TransactionRunner) private readonly tx: TransactionRunner,
  private readonly units: UnitService,
) {}

execute(request: RecordUnitEventRequest) {
  return this.tx.run(async () => toView(await this.units.record(request)));
}
```

- `this.db.get()` 의 반환값을 필드나 생성자에서 보관하지 않는다. 보관한 연결은 트랜잭션에 참여하지 못한다.
- `InfraModule` 의 `DB` 토큰(루트 연결)과 `enqueue(tx, ...)`·`claimMessage(tx, ...)` 는 옮기기 전 코드를 위한 것이다. `DB` 로 실행한 쿼리는 `run` 에 참여하지 않으므로 새 구조에서는 쓰지 않는다.

## 이벤트

- 다른 서비스로 내보내는 이벤트는 application 서비스가 `EventOutbox` 포트로 적는다. usecase 가 연 트랜잭션에 같이 묶인다.
- 받는 쪽은 `presentation/consumer` 다. 메시지를 `@repo/contracts` 스키마로 검증한 뒤 usecase 를 부른다. 멱등 처리는 usecase 의 트랜잭션 안에서 `MessageInbox.claim` 으로 한다. 트랜잭션 밖에서 부르면 예외가 난다.

```ts
// domains/service-case/application/service-case.service.ts
constructor(
  @Inject(ServiceCaseRepository) private readonly cases: ServiceCaseRepository,
  @Inject(EventOutbox) private readonly outbox: EventOutbox,
) {}

await this.cases.save(updated);
await this.outbox.enqueue(Topics.asCaseEvents, updated.serialNumber, makeEvent('as.doa.confirmed', { ... }));

// usecases/apply-doa-confirmed.usecase.ts  (consumer 가 부른다)
execute(message: { id: string; event: DoaConfirmed }) {
  return this.tx.run(async () => {
    if (!(await this.inbox.claim(CONSUMER_GROUP, message.id))) return;
    await this.orders.requestReplacement(message.event);
  });
}
```

## 타입과 규격

- `@repo/contracts` 의 요청·응답 타입(`*Request`, `*View`)은 서비스의 공개 규격이다. `presentation` 과 `usecases` 에서 쓴다.
- `domain` 과 `application` 은 자기 도메인 타입을 쓴다. 규격의 값 타입(`UnitStatus` 같은 enum 류)은 같은 말을 두 번 정의하지 않기 위해 domain 에서도 가져다 쓴다.
- 도메인 타입 → 응답 타입 변환은 usecase 가 한다.

## 에러

- application 과 usecase 는 `errors.ts` 의 에러 함수로 던진다 (`throw scmError('UNIT_NOT_FOUND')`).
- domain 의 순수 함수는 던지지 않는다. 결과 값으로 표현한다 (예: `anomalies` 목록, `undefined`).

## 이름

| 대상                  | 파일                                               | 클래스·심볼                                   |
| --------------------- | -------------------------------------------------- | --------------------------------------------- |
| repository 인터페이스 | `domain/unit.repository.ts`                        | `UnitRepository`                              |
| repository 구현       | `infra/drizzle-unit.repository.ts`                 | `DrizzleUnitRepository`                       |
| application 서비스    | `application/unit.service.ts`                      | `UnitService`                                 |
| usecase               | `usecases/record-unit-event.usecase.ts`            | `RecordUnitEventUsecase` (메서드는 `execute`) |
| controller            | `presentation/api/units.controller.ts`             | `UnitsController`                             |
| consumer              | `presentation/consumer/as-case-events.consumer.ts` | `AsCaseEventsConsumer`                        |

- 도메인 폴더 이름은 단수 명사 (`unit`, `order`, `service-case`).
- usecase 는 파일 하나에 클래스 하나, 공개 메서드는 `execute` 하나.

## 테스트

- `domain` 의 순수 함수는 반드시 단위 테스트한다. 파일 옆에 `*.spec.ts`.
- `application` 은 repository 인터페이스의 메모리 구현으로 DB 없이 테스트할 수 있다.
- DB 와 이벤트를 거치는 흐름은 `mise run demo` 로 확인한다.

## 기능을 추가하는 순서

1. 규칙이 필요하면 `domain` 에 타입과 순수 함수, 테스트.
2. 저장이 필요하면 `db/schema.ts` 와 마이그레이션, `domain` 에 repository 인터페이스, `infra` 에 구현.
3. `application` 서비스에 한 도메인 안의 흐름.
4. `usecases` 에 요청 하나의 처리 전체.
5. `presentation` 에 controller 나 consumer. 요청·응답 규격은 `@repo/contracts`.

## 이행 상태

이 규칙은 2026-10-03 에 정했고, 기존 코드는 아직 기능별 폴더(`units/`, `orders/`, `cases/` 등)에 controller·service 가 함께 있다.
아래 순서로 옮긴다. 옮긴 서비스는 목록에서 지우고, 전부 끝나면 이 절을 삭제한다.

- [x] 공용 부품: `TransactionRunner`, `CurrentDb`, `EventOutbox`, `MessageInbox`, 레이어 의존 린트 규칙
- [ ] `scm-api` (도메인: `catalog`, `unit`)
- [ ] `oms-api` (도메인: `sellable`, `order`)
- [x] `as-api` (도메인: `service-case`)
