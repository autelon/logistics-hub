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

자동 테스트는 단위 수준(도메인 순수 함수, 메모리 구현으로 돌리는 application 서비스, `TEST_DATABASE_URL` 이 있을 때의 db-kit DB 통합)까지다. e2e 테스트 코드는 두지 않는다.
그 위(HTTP, 이벤트, 웹 콘솔)는 `docs/testing.md` 의 정책대로 서비스를 실제로 띄우고 `docs/playbooks/` 를 따라 확인한 뒤, **실제로 본 결과**를 PR 의 `검증` 에 적는다 (`pnpm check` 통과만으로 동작한다고 말하지 않는다).

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
- **oxlint 의 `overrides` 는 같은 규칙의 옵션을 합치지 않는다.** 파일에 맞는 마지막 override 의 옵션이 앞의 것을 통째로 대체한다.
  그래서 `.oxlintrc.json` 의 `eslint/no-restricted-imports` 는 override 마다 Nest 예외 금지(`paths`)를 반복해 적어 두었다. 한 곳을 고치면 나머지도 고친다.
- **`apps/web` 은 zod 를 직접 import 하지 않는다.** 필요한 타입은 `@repo/contracts` 에서 export 해서 쓴다.
- **스키마를 바꾸면 `db:generate` 로 마이그레이션을 만든다.** `drizzle/` 아래 생성물은 손으로 고치지 않는다.
  서비스의 테이블은 `src/db/schema.ts` 한 파일에 둔다.
- **Drizzle 은 `select / join` 빌더만 쓴다.** 관계형 쿼리 API(`db.query`)는 1.0 에서 바뀌므로 쓰지 않는다.
- `apps/web/src/routeTree.gen.ts` 는 Vite 가 생성한다. 라우트 파일을 추가·삭제했으면 `pnpm --filter web build` 로 갱신하고 커밋한다.

## 깨면 안 되는 설계 원칙

- **모든 테이블의 기본 키는 앱에서 만든 UUIDv7 `id` 하나다.** 코드(`sku`, `code`)는 unique 컬럼, 외래 키는 `id` 참조, 밖에 보여 줄 번호는 `public_id`. 규칙은 `docs/02-domain-model.md` 의 "기본 키".
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
- **설정은 `@Inject(xConfig.KEY) x: ConfigType<typeof xConfig>` 로만 읽는다** (`@repo/nest-kit/config`). 앱 코드의 `process.env` 와 `ConfigService` 는 린트 오류다.
  **로그는 `new Logger(클래스.name)`** 으로 남긴다. `main.ts` 가 설치한 `AppLogger` 로 넘어가므로 `ConsoleLogger` 를 직접 만들지 않는다.
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
- 아직 구현하지 않은 것은 로드맵 이슈(제목이 `[로드맵]` 인 Task 이슈, 예전 `docs/05-roadmap.md`)와 `docs/06-inbound-design.md` "구현 순서"에 있다. 새 기능 전에 여기부터 확인한다.

도메인 동작이나 구조를 바꾸면 해당 문서도 같이 고친다.
`README.md` 만 사람이 읽는 문서라 영어로 쓴다. 나머지 문서·주석·커밋·이슈는 한국어다.

## autelon 운영

이 프로젝트는 autelon 플러그인(`.claude/settings.json` 의 `enabledPlugins`)으로 운영한다. 2026-10-04 에 도입했다(결정 이슈 #13).

**지금은 혼합 방식이다.**

- **기획·조사·결정**은 director 방식이다. 세션을 시작하면 `autelon:director` 스킬을 불러 그 규칙(이슈 기록, PRD, role 결과 코멘트, 사람 승인, 재무 규칙)대로 한다. 도메인 판단은 `.claude/agents/` 의 전문가 role 에 맡기고 결과를 사람에게 승인받는다.
- **코드 구현·PR 검토·병합**은 `docs/agent-workflow.md` 그대로다. 구현은 `developer` role 이 worktree 에서, 검토와 머지 명령은 `reviewer` role 이, 보안 검토는 `autelon:security-reviewer` 가 한다(`docs/git-rules.md` "PR 리뷰어와 보안 검토"). 코드 PR 은 사람이 하나씩 승인하지 않는다.
- director 규칙과 다르게 두는 것: 메인 에이전트(director)는 지금처럼 `CLAUDE.md`·`docs/` 를 직접 고칠 수 있다(`docs/agent-workflow.md` 의 예외). 사람 승인은 기획 산출물(PRD, 전문가 role 의 결론, 06 의 미결 항목에 대한 답)에만 받는다.
- 다음 단계(코드 작업도 task 이슈의 사람 승인으로 옮길지)는 PRD 몇 건을 이 방식으로 운영한 뒤 사용자가 정한다.
- 기존 원칙이 우선한다: 근거 없이 정하지 않는다(`docs/agent-workflow.md` "근거 없이 결정하지 않는다"). 기존 문서의 결정을 role 이 뒤집지 않는다. 바꿔야 하면 사람에게 묻는다.

**role** (`.claude/agents/`)

| 구분        | role                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전략·구조   | `strategist`(목표·지표, 모듈형 제품의 사업 측면), `architect`(서비스 경계·규격, 모듈형 제품의 기술 측면)                                                      |
| 도메인 전문 | `procurement-expert`, `transport-expert`, `customs-trade-expert`, `warehouse-expert`, `reverse-logistics-expert`, `traceability-expert`, `fulfillment-expert` |
| 제품·개발   | `po`, `developer`, `reviewer`, `designer`, `da`                                                                                                               |
| 공용        | `autelon:security-reviewer`(모든 PR), `autelon:finance`                                                                                                       |

`docs/06-inbound-design.md` "결정 전에 확인이 필요한 것"의 각 항목은 담당 전문가 role 이 정해져 있다(각 role 파일의 "네가 끌고 갈 미결 항목").

## 기록 (GitHub)

"언제 무슨 일이 있었고 왜 그렇게 정했나"는 이슈에 남긴다. 저장소 문서에는 지금 기준의 결론만 쓴다.
2026-10-04 에 예전 기록 파일(`board/`, `handoffs/`, `decisions/log.md`, `state/sprint.md`, `docs/first-run.md`, `docs/05-roadmap.md`)을 이슈로 옮기고 지웠다. 예전 ID(T-0001 등)는 각 이슈 본문 "현재 결론"에 있다. 원래 파일은 git 히스토리에서 볼 수 있다.

| 무엇                       | 어디                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| task, PRD, 결정, role 결과 | `autelon/logistics-hub` 이슈 (task = Task, PRD = Feature, 결정 = `decision` 라벨, role 결과 = 코멘트)  |
| 로드맵                     | 제목이 `[로드맵]` 인 Task 이슈, 조직 Project 로드맵 화면                                               |
| 보드                       | 조직 Project #2 (`logistics-hub`). 필드 `Status`·`Role`·`Size`·`Start date`·`Target date`              |
| 세션 인계                  | 고정된 "현재 스프린트" 이슈 (`sprint` 라벨)                                                            |
| first-run 결과             | `first-run` 라벨 이슈                                                                                  |
| 루틴(이슈 작업 루프)       | `agent:ready` 라벨 이슈를 처리한다. `agent:needs-user` 는 사람의 답을 기다린다. 라벨이 없으면 초안이다 |

Project 기본 워크플로는 Item added → `backlog`, Item closed → `done`, Auto-close issue, Auto-add sub-issues 를 켜고, Pull request linked·merged 는 껐다(플러그인 `playbooks/issues.md` 기준값).

## 프로젝트 파일

| 경로                    | 내용                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `docs/goals.md`         | 목표와 지표 체계. `docs/01` 의 요약                                                             |
| `analytics/`            | 지표 정의·쿼리 (da)                                                                             |
| `state/`                | 사용량 스냅샷(`quota.json`, 커밋하지 않음)                                                      |
| `local/`                | 로컬 매핑, 이슈 본문·코멘트 초안, 이슈 백업. 커밋하지 않음                                      |
| `notion/`               | 예전 Notion 연동의 페이지·DB ID. 커밋하지 않음. Notion 페이지를 보관할지 지울지는 사람이 정한다 |
| `.claude/agent-memory/` | role 메모리(`memory: project`). 커밋하지 않음                                                   |
| `docs/git-rules.md`     | 저장소 설정, PR 리뷰어, 보안 검토·머지 조건(공통 절차는 `autelon/.github` 의 `git-workflow.md`) |

Notion URL·ID, 로컬 절대 경로, 계정 정보는 커밋·PR·이슈·코멘트에 쓰지 않는다. 이슈·코멘트·PR 글은 autelon 플러그인의 검사 스크립트(`privacy-check.mjs`)로만 올린다. 커밋 전에 `git diff --cached | grep -n -E 'notion\.(com|so|site)|/Users/'` 가 비어 있어야 한다.
