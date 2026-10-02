# Logistics Hub

물리 제품(시리얼) 한 개의 생애주기를 추적하는 통합 물류 시스템이자 NestJS + React 모노레포 템플릿.

## 검증

도구 버전은 mise 가 고정한다. 셸에 mise 가 활성화되어 있지 않으면 명령 앞에 `mise exec --` 를 붙인다.

작업을 마치면 반드시 `pnpm check` 를 돌린다 (빌드 + 타입체크 + 린트 + 테스트 + 포맷 검사, CI 와 동일).

| 목적              | 명령                                                              |
| ----------------- | ----------------------------------------------------------------- |
| 빌드              | `pnpm build`                                                      |
| 타입체크          | `pnpm check-types`                                                |
| 린트              | `pnpm lint`                                                       |
| 테스트            | `pnpm test`                                                       |
| 포맷 적용 / 검사  | `pnpm format` / `pnpm format:check`                               |
| 한 워크스페이스만 | `pnpm turbo run test --filter=scm-api`                            |
| 테스트 파일 하나  | `pnpm --filter oms-api exec vitest run <파일 경로>`               |
| 마이그레이션 생성 | `pnpm db:generate` (한 앱만: `pnpm --filter scm-api db:generate`) |

테스트는 순수 도메인 함수만 다룬다. DB·이벤트를 거치는 변경은 실제로 돌려서 확인한다 (`pnpm check` 통과만으로 동작한다고 말하지 않는다).

1. `colima status` 가 실패하면 `colima start`, 그다음 `mise run infra:up` (MySQL, Redis 컨테이너)
2. `pnpm db:migrate`
3. `pnpm dev` (서비스 3개 + 웹, 백그라운드로) 후 `mise run demo` — 제조부터 정정·DOA·폐기·교체 출고까지 실제 API 로 재현하고, 중간에 기대 상태가 안 되면 실패한다

## 함정

- **Prettier 는 소스뿐 아니라 리포 전체에 적용된다** (json, md, yaml, toml, 워크스페이스 파일 포함). 어떤 파일이든 고친 뒤 `pnpm format` 을 돌린다. 커밋 시에는 `.githooks/pre-commit` 이 스테이징된 파일을 자동으로 맞춘다.
- **Nest CLI 를 못 쓴다.** TypeScript 7.0 은 컴파일러 API 가 없어 `nest build`/`nest start`/`nest g` 가 실패한다.
  빌드는 `tsc -p tsconfig.build.json`, 파일은 직접 만든다.
- **ESM.** 상대 경로 import 에 `.js` 확장자가 필요하다 (`./foo.js`). `apps/web` 만 번들러 방식이라 확장자를 붙이지 않는다.
- **타입만 쓰는 import 는 `import type`.** 단, Nest 가 생성자 주입에 쓰는 클래스는 값 import 여야 한다.
- **의존성 버전은 `pnpm-workspace.yaml` 의 `catalog` 에서만 관리한다.** 각 `package.json` 에는 `"catalog:"` 로 적는다.
  `pnpm add <pkg> --filter <워크스페이스>` 를 쓰면 `catalogMode: strict` 가 알아서 그렇게 기록한다.
- **pnpm 은 설치 스크립트를 기본 차단한다.** postinstall 이 필요한 의존성을 추가하면 설치가 실패하므로
  `pnpm-workspace.yaml` 의 `allowBuilds` 에 등록한다.
- **패키지에 `index.ts` 배럴이 없다.** `@repo/contracts/scm` 처럼 파일 단위 서브경로로 import 한다 (`@repo/contracts` 는 해석되지 않는다).
  앱 안에서도 폴더를 모아 다시 export 하는 `index.ts` 를 만들지 않는다 (트리 셰이킹).
- **함수는 `const` 화살표로 정의한다.** 호이스팅되지 않으므로 쓰는 곳보다 위에 둔다. 라우트 파일의 `export const Route` 는 컴포넌트 정의 아래에 온다.
- **`base.json` 은 `erasableSyntaxOnly` 다.** `packages/*` 에서는 생성자 파라미터 프로퍼티(`constructor(private x)`)와 enum 을 못 쓴다. Nest 앱(`nest.json`)만 허용한다.
- **turbo 설정이나 명령을 바꾸기 전에** `node_modules/turbo/docs/` 의 해당 문서를 먼저 읽는다. 설치된 버전 기준 문서다.
- **패키지는 `dist` 로 소비된다.** `packages/*` 를 고친 뒤 앱에서 `tsc` 나 `vitest` 를 직접 돌리면 옛 타입을 본다.
  turbo 로 돌리거나 먼저 `pnpm build` 한다.
- **타입 인지 린트 규칙은 `oxlint-disable-next-line` 주석으로 꺼지지 않는다.** 꼭 필요하면 `.oxlintrc.json` 의 `overrides` 에 파일 단위로 넣는다.
- **`apps/web` 은 zod 를 직접 import 하지 않는다.** 필요한 타입은 `@repo/contracts` 에서 export 해서 쓴다.
- **스키마를 바꾸면 `db:generate` 로 마이그레이션을 만든다.** `drizzle/` 아래 생성물은 손으로 고치지 않는다.
  서비스의 테이블은 `src/db/schema.ts` 한 파일에 둔다.
- **Drizzle 은 `select / join` 빌더만 쓴다.** 관계형 쿼리 API(`db.query`)는 1.0 에서 바뀌므로 쓰지 않는다.
- `apps/web/src/routeTree.gen.ts` 는 Vite 가 생성한다. 라우트 파일을 추가·삭제했으면 `pnpm --filter web build` 로 갱신하고 커밋한다.

## 깨면 안 되는 설계 원칙

- **`unit_events` 는 추가만 한다.** 수정·삭제하지 않는다. 틀린 사실은 `unit_event_corrections` 에 정정 기록을 추가해 무효화한다.
- **`units` 의 상태 컬럼은 캐시다.** 직접 고치지 않고, 유효한 사실들을 `projectUnit` 으로 접어서 다시 만든다.
- **업체가 보고한 사실은 순서가 이상해도 거부하지 않는다.** 반영하고 `anomalies` 에 표시한다.
- **서비스 간 이벤트는 반드시 아웃박스로 낸다.** 업무 데이터를 바꾸는 트랜잭션 안에서 `EventOutbox.enqueue(...)` (아직 옮기지 않은 코드는 `enqueue(tx, ...)`).
  `MessageBus.publish` 를 서비스 코드에서 직접 부르지 않는다.
- **이벤트 핸들러는 멱등이어야 한다.** 같은 메시지가 두 번 올 수 있다 (`claimMessage` 또는 `idempotencyKey`).
- **서비스 간 규격(이벤트, 요청 스키마, 응답 타입)은 `@repo/contracts` 에만 정의한다.**
  서비스끼리 서로의 코드나 DB 를 직접 참조하지 않고, 동기 HTTP 호출도 하지 않는다.
- **에러 응답에는 항상 문자열 `code` 가 있다.** 서비스 코드는 Nest 내장 예외 대신 자기 앱의 `errors.ts` 로 던진다 (`throw scmError('UNIT_NOT_FOUND', '보조 설명')`).
  새 코드는 `@repo/contracts` 의 해당 서비스 `*ErrorCode` 에 추가하고 `errors.ts` 에 상태를 적는다. `message` 는 선택이고, 호출 측 분기는 `code` 로만 한다.
- **판단 규칙은 순수 함수로 빼고 테스트한다** (예: `unit-projection.ts`, `fulfillment.ts`). 서비스 클래스에 규칙을 섞지 않는다.

## 작업 방식과 구조

- 코드 작업은 서브에이전트에게 나눠 맡기고 메인 에이전트가 PR 을 검토해 병합한다. 역할과 검토 기준은 `docs/agent-workflow.md`.
- `apps/*-api` 에 코드를 추가하거나 옮기기 전에 `docs/architecture-rules.md` 를 읽는다.
  도메인 모듈(`domains/<도메인>/{domain,application,infra}`) + `usecases/` + `presentation/{api,consumer,batch}` 구조와 레이어 의존 규칙이 있다.

## Git

커밋이나 PR 을 만들기 전에, 그리고 기존 코드가 왜 그 모양인지 조사할 때 `docs/git-rules.md` 를 먼저 읽는다.
히스토리는 다음 에이전트가 읽는 자료라는 전제로 쓴 규칙이고, `commit-msg` 훅이 형식을 검사한다.

## 설계 문서

- `docs/01-concept.md` — 시스템이 하는 일과 하지 않는 일, 세 가지 원칙, OMS·AS 와의 경계
- `docs/02-domain-model.md` — 테이블, 사실 종류와 상태 전이, 정정, 패키지 주문, DOA 이벤트
- `docs/03-architecture.md` — 서비스·토픽 구성, 아웃박스와 멱등 처리, 패키지 의존 방향
- `docs/04-decisions.md` — 기술 선택과 이유
- `docs/05-roadmap.md` — 아직 구현하지 않은 것. 새 기능 전에 여기부터 확인

도메인 동작이나 구조를 바꾸면 해당 문서도 같이 고친다.
`README.md` 만 사람이 읽는 문서라 영어로 쓴다. 나머지 문서·주석·커밋은 한국어다.
