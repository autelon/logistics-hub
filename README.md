# Logistics Hub

물리 제품 한 개의 **제조 → 입고 → 출고 → 배송 → (DOA) → 폐기** 전체 생애주기를 추적하는 통합 물류 관리 시스템.
공장·창고·배송·AS 는 각 업체 시스템이 실행하고, 이 시스템은 그 결과를 **연동해서 기록하고, 틀린 기록을 바로잡는다.**

동시에 NestJS + React 모노레포 템플릿이기도 하다.

- 왜 이렇게 만들었나 → [docs/01-concept.md](docs/01-concept.md)
- 무엇을 어떻게 기록하나 → [docs/02-domain-model.md](docs/02-domain-model.md)
- 서비스·패키지 구조 → [docs/03-architecture.md](docs/03-architecture.md)
- 기술 선택과 이유 → [docs/04-decisions.md](docs/04-decisions.md)
- 아직 안 만든 것 → [docs/05-roadmap.md](docs/05-roadmap.md)
- 커밋·PR 규칙 → [docs/git-rules.md](docs/git-rules.md)

## 시작하기

필요한 것: [mise](https://mise.jdx.dev), 그리고 `docker`·`docker-compose` 명령 (Colima 기준: `brew install colima docker docker-compose && colima start`).
MySQL 과 Redis 는 호스트에 설치하지 않고 `compose.yaml` 에 버전을 고정한 컨테이너로 띄운다.

```bash
mise install      # node, pnpm 버전 맞추기
mise run setup    # 의존성 설치, .env 생성, MySQL·Redis 기동, 마이그레이션
mise run dev      # 서비스 3개 + 웹 콘솔
mise run demo     # (다른 터미널에서) 전체 흐름을 실제 API 로 재현
```

VS Code 는 `code logistics-hub.code-workspace` 로 연다. 앱·패키지가 각각 최상위 폴더로 보인다.

| 앱        | 주소                  | 역할                                        |
| --------- | --------------------- | ------------------------------------------- |
| `web`     | http://localhost:5173 | 관리 콘솔 (제품 추적, 재고, 주문)           |
| `scm-api` | http://localhost:3001 | 제품 이력 원장, 정정, 재고                  |
| `oms-api` | http://localhost:3002 | 채널 주문 수집, 패키지 분해, 출고 항목 추적 |
| `as-api`  | http://localhost:3003 | DOA 연동 규격 검증용 간이 AS                |

## 구조

```
apps/
  scm-api  oms-api  as-api     NestJS 서비스. 각자 자기 DB 를 가진다.
  web                          Vite + React 관리 콘솔
packages/
  contracts                    서비스 간 약속: 이벤트·요청 스키마(zod), 응답 타입
  messaging                    MessageBus 인터페이스 + Redis Streams / 인메모리 구현
  db-kit                       Drizzle 공용 부품: 아웃박스, 인박스, 컬럼 규칙
  nest-kit                     Nest 공용 부품: 인프라 모듈, zod 파이프, env 로딩
  typescript-config            tsconfig 프리셋
```

## 자주 쓰는 명령

| 명령               | 하는 일                                                  |
| ------------------ | -------------------------------------------------------- |
| `pnpm check`       | 빌드 + 타입체크 + 린트 + 테스트 + 포맷 검사 (CI 와 동일) |
| `pnpm dev`         | 전체 개발 서버                                           |
| `pnpm test`        | 테스트                                                   |
| `pnpm format`      | Prettier 적용                                            |
| `pnpm db:generate` | 스키마 변경에서 마이그레이션 SQL 생성                    |
| `pnpm db:migrate`  | 마이그레이션 적용                                        |

한 앱만: `pnpm --filter scm-api dev`, `pnpm turbo run test --filter=oms-api`

## 규칙

- **버전은 `pnpm-workspace.yaml` 의 `catalog` 한 곳에서만** 올린다. 각 `package.json` 은 `"catalog:"` 로 참조한다.
- **서비스끼리는 서로의 코드나 DB 를 직접 보지 않는다.** 주고받는 것은 `packages/contracts` 에 정의된 것뿐이다.
- **이벤트는 반드시 아웃박스로 낸다** (`enqueue(tx, ...)`). 업무 데이터와 같은 트랜잭션에 묶여야 유실되지 않는다.
- **이벤트 핸들러는 멱등이어야 한다.** 같은 메시지가 두 번 올 수 있다.
- **제품 이력(`unit_events`)은 수정·삭제하지 않는다.** 틀렸으면 정정 기록을 추가한다.
