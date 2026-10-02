# 4. 기술 선택

버전은 2026-10 기준 각 도구의 최신 안정판이다. 실제 값은 `pnpm-workspace.yaml` 의 catalog 와 `mise.toml` 에 있다.

| 영역          | 선택                                                   | 이유                                                                                      |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 런타임        | Node 24 (LTS)                                          | 현재 Active LTS. 26 이 LTS 로 전환되면 `mise.toml` 한 줄만 바꾼다                         |
| 패키지 매니저 | pnpm 12 + catalog                                      | 버전을 한 곳에서 관리. 설치 스크립트 기본 차단, 갓 배포된 패키지 지연 설치 등 공급망 방어 |
| 태스크 러너   | Turborepo 2                                            | 의존 순서대로 빌드, 캐시                                                                  |
| 도구 버전     | mise                                                   | node·pnpm 버전과 프로젝트 태스크를 한 파일로                                              |
| 언어          | TypeScript 7                                           | 네이티브 컴파일러. 전체 타입체크가 1초 안쪽                                               |
| 모듈          | ESM (`nodenext`)                                       | Nest 12 기본값                                                                            |
| 백엔드        | NestJS 12                                              |                                                                                           |
| DB            | MySQL 9.7 LTS                                          | 아래 참고                                                                                 |
| ORM           | Drizzle 0.45                                           | 아래 참고                                                                                 |
| 검증          | zod 4                                                  | 스키마 하나로 런타임 검증과 타입을 동시에. 서버·웹이 공유                                 |
| 메시징        | Redis Streams (`MessageBus`)                           | 아래 참고                                                                                 |
| 프런트        | Vite 8 + React 19 + TanStack Router/Query + Tailwind 4 | 내부 콘솔이라 SPA 로 충분                                                                 |
| 테스트        | Vitest 5                                               | Nest 12 공식 템플릿 기본값                                                                |
| 린트          | oxlint (타입 인지)                                     | Nest 12·Vite 8 공식 템플릿이 ESLint 대신 채택. typescript-eslint 는 아직 TS 7 미지원      |
| 포맷          | Prettier 3 + import 정렬·Tailwind 클래스 정렬 플러그인 | oxfmt 는 아직 0.x 라 보류                                                                 |

## RDBMS (MySQL) — MongoDB 가 아닌 이유

이 시스템의 핵심은 "사실을 추가하고, 정정하고, 그 결과로 상태와 아웃박스를 **한 트랜잭션으로** 갱신"하는 것이다.
제품–이력–정정–주문 항목 사이의 참조 무결성과 다중 행 트랜잭션, 행 잠금(`FOR UPDATE`, `SKIP LOCKED`)이 필요하다.
스키마가 자유로워야 하는 부분(업체별 원본 보고)은 JSON 컬럼으로 충분하다.

## Drizzle — 타입 안전성 기준

- 클래스 엔티티가 없다. 결과 타입은 **쿼리 모양에서 추론**된다. 컬럼 3개만 select 하면 타입도 그 3개만 가진다.
  join 하면 nullable 여부까지 반영된다. "타입은 엔티티인데 런타임 값은 일부만 채워진 객체"가 생기지 않는다.
- 코드 생성 단계가 없다. 스키마가 곧 TypeScript 다.
- `varchar().$type<UnitStatus>()` 로 컬럼 타입을 `contracts` 의 zod enum 타입과 묶었다.

1.0 은 아직 RC 라 안정판 0.45 를 쓴다. 1.0 에서 바뀌는 관계형 쿼리 API(`db.query`)는 쓰지 않고
`select / join` 빌더만 썼기 때문에 올릴 때 고칠 것이 거의 없다.

## Redis Streams — BullMQ·pub/sub 이 아닌 이유

- Redis **pub/sub** 은 구독자가 내려가 있는 동안의 메시지를 잃는다. 이력 시스템에 쓸 수 없다.
- **BullMQ** 는 작업 큐다. "한 이벤트를 여러 서비스가 각자 한 번씩 받는" 구조가 아니라서
  발행 쪽이 구독자를 알아야 하고, Kafka 로 옮길 때 구조가 달라진다. (업체 API 폴링 같은 예약 작업에는 적합하다.)
- **Redis Streams** 는 로그 + 컨슈머 그룹 + ack 로 Kafka 와 같은 모양이다. 로컬에서는 Redis 하나로 끝난다.

## Nest CLI 를 쓰지 않는다

Nest CLI(`nest build`, `nest start`)는 TypeScript 컴파일러 API 를 쓰는데, TS 7.0 은 `tsc` 실행 파일만 제공한다
(API 는 7.1 예정). 그래서 빌드는 `tsc`, 개발 서버는 `tsc --watch` + `node --watch` 로 한다.
7.1 이후에도 이 방식이 더 단순해서 되돌릴 이유는 크지 않다.

## 요청 검증에 class-validator 대신 zod

Nest 기본인 class-validator DTO 는 클래스와 데코레이터가 필요하고 타입과 검증 규칙이 따로 논다.
`@Body(zod(Schema)) body: Schema` 한 줄로 검증과 타입이 같은 정의에서 나오고, 그 정의를 웹과 이벤트 소비 측이 같이 쓴다.

## 타입 엄격도

`strict` 에 더해 `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`,
`noImplicitReturns`, `noUnusedLocals/Parameters`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`,
`erasableSyntaxOnly` 를 켰다. `erasableSyntaxOnly` 는 Nest 의 생성자 주입 문법과 충돌해서 Nest 앱에서만 끈다.

## 배럴(index.ts) 없음, 서브경로 export

패키지는 `"exports": { "./*": "./dist/*.js" }` 와 `"sideEffects": false` 로 파일 단위로 내보낸다.
`@repo/contracts/scm` 처럼 필요한 파일만 가져오므로 번들러가 나머지를 건드리지 않는다.
`oxc/no-barrel-file` 규칙이 `export *` 를 막는다.

## 함수는 const 화살표

`func-style` 규칙으로 강제한다. 클래스 메서드는 해당 없다.

## 포맷은 리포 전체에, 세 군데에서 강제

Prettier 대상은 소스만이 아니라 git 에 들어가는 모든 파일이다 (json, md, yaml, toml, html, css, 워크스페이스 파일).
제외는 생성물뿐이다: lockfile, `dist`, 마이그레이션 SQL, 라우트 트리. Prettier 가 못 다루는 형식(sql, `.env.example`)은 `.editorconfig` 가 기본만 맞춘다.

1. 편집기 — 저장 시 포맷 (워크스페이스 설정)
2. 커밋 — `.githooks/pre-commit` 이 스테이징된 파일을 고쳐서 다시 스테이징. `pnpm install` 때 `core.hooksPath` 가 설정된다 (훅 관리 도구 없음)
3. CI — `pnpm check` 의 `prettier --check .`
