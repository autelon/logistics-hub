# 플레이북

떠 있는 시스템을 **그대로 따라 조작해서** 동작을 확인하는 절차다. 에이전트가 실행하는 것을 전제로 썼고 사람이 해도 된다.
정책(무엇을 자동화하고 무엇을 여기서 확인하는지)은 [../testing.md](../testing.md).

| 파일                                 | 다루는 것                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [scm-api.md](scm-api.md)             | 기준 정보, 사실 기록과 생애주기, 재고, 정정, 에러 코드, 멱등 키(동시 중복 포함), AS 수신, 거점 정책                   |
| [oms-api.md](oms-api.md)             | 판매 상품, 주문 수신(패키지 풀기, 중복), 조회, SCM 이벤트 수신, DOA 교체 출고, 에러 코드                              |
| [as-api.md](as-api.md)               | 접수·판정·폐기, 접수 번호, 에러 코드, 아웃박스                                                                        |
| [registration.md](registration.md)   | 제품 등록(제외 사유 포함), 기기 요청과 모의 기기 서버, 실패·재시도, 미등록 출고 이상, DOA·등록 무효화의 비활성화 요청 |
| [procurement.md](procurement.md)     | 발주 작성·발행·개정·줄 닫기·취소, 개정 이력, 거절 코드, 번호 채번과 행 잠금                                           |
| [transport.md](transport.md)         | 선적 제출(대량, 발주 연결, 차수 번호, 이상), 중복·동시 제출, 운영자 연결, 제품 등록, 대량, 무효화·재제출              |
| [warehouse.md](warehouse.md)         | 시리얼 없는 제품의 수량 원장(대량 기록, 중복 키·동시 중복, 거절, 정정), 통합 재고, 음수·0 행                          |
| [web-console.md](web-console.md)     | 웹 콘솔 화면(제품 추적과 정정 UI, 재고, 주문, 제품 등록, 발주)                                                        |
| [cross-service.md](cross-service.md) | 제조부터 정정·DOA·폐기·교체 출고까지 세 서비스를 가로지르는 전체 흐름, 아웃박스·Redis 전달 확인                       |

각 플레이북의 기대값은 **실제로 돌려서 본 응답**이다. 기대값을 고칠 때도 실제 응답을 붙여 넣는다.

## 준비

1. 인프라: `colima status` 가 실패하면 `colima start`, 그다음 `mise run infra:up` (MySQL, Redis).
2. 빌드와 마이그레이션: `mise exec -- pnpm build`, `mise exec -- pnpm db:migrate`.
3. 서비스 기동. 두 가지 중 하나.
   - **메인 에이전트 / 사람**: `pnpm dev` (3001·3002·3003, 모의 기기 서버 3004, 웹 5173). DB 는 `lh_scm`·`lh_oms`·`lh_as`.
   - **서브에이전트**: 공유 자원을 쓰지 않는다 (`docs/agent-workflow.md`). 자기 DB 를 만들고(`lh_<앱>_<작업>`), 자기 포트로, Redis 는 다른 논리 DB 번호(`/7` 처럼)를 써서 컨슈머 그룹이 겹치지 않게 띄운다.
     ```sh
     # 앱마다 (scm→3101, oms→3102, as→3103 처럼 3001-3004 를 피한다)
     cd apps/scm-api
     DATABASE_URL=mysql://root:root@localhost:3306/lh_scm_<작업> mise exec -- pnpm db:migrate
     PORT=3101 DATABASE_URL=mysql://root:root@localhost:3306/lh_scm_<작업> REDIS_URL=redis://localhost:6379/7 \
       mise exec -- node dist/main.js > /tmp/scm-api.log 2>&1 &
     ```
     제품 등록(`registration.md`)은 모의 기기 서버(`apps/device-api`)도 필요하다. scm-api 에 `DEVICE_API_URL=http://localhost:<기기 서버 포트>`, 기기 서버에 `PORT`, `HUB_URL=http://localhost:<scm 포트>`, 선택으로 `FAIL_SERIAL_SUFFIX` 를 준다 (DB 는 없다).
     끝나면 **자기 PID 만** 멈추고(`kill $(lsof -ti:3101)`) DB 를 지운다. 웹 콘솔을 다른 포트·프록시로 띄우는 방법은 [web-console.md](web-console.md).
4. 셸 변수. 플레이북의 명령은 이 변수와 함수를 전제한다.

   ```sh
   SCM=http://localhost:3001; OMS=http://localhost:3002; AS=http://localhost:3003; DEV=http://localhost:3004   # 서브에이전트는 자기 포트
   RUN=$(date +%s)   # 실행 식별자. 시리얼·주문번호에 붙여 같은 DB 에서 여러 번 돌릴 수 있게 한다
   post() { curl -s -w '\n→ %{http_code}\n' -X POST "$1" -H 'content-type: application/json' -d "$2"; }
   get()  { curl -s -w '\n→ %{http_code}\n' "$1"; }
   ```

   `post $SCM/products '{...}'` 는 `curl -s -X POST http://localhost:3001/products -H 'content-type: application/json' -d '{...}'` 와 같고, 본문 뒤에 `→ 상태코드` 한 줄을 더 찍는다.

5. 상태 확인: `get $SCM/health` → `{"status":"ok"}` → 200. 세 서비스 모두.

## 읽는 법

- 단계는 `### N.` 으로 번호가 있다. 보고할 때 이 번호를 쓴다.
- **기대** 블록은 상태 코드와 본문이다. 값이 매번 달라지는 필드는 `<uuid>`, `<시각>` 처럼 적었고 그 밖의 값은 그대로 같아야 한다. `…` 는 앞 단계와 같은 내용의 생략이다.
- 이벤트는 비동기로 전달된다 (아웃박스 릴레이 0.5초 주기 + 브로커). "잠시 뒤" 라고 적힌 단계는 1–2초 기다렸다가 조회하고, 안 맞으면 몇 번 더 조회한 뒤 실패로 본다.
- 응답의 id(`eventId`, `orderId`, 케이스 `id`)는 뒤 단계에서 쓴다. 변수에 담아 둔다 (`EVENT=$(... | jq -r .eventId)` 식으로. `jq` 가 없으면 눈으로 옮긴다).
- DB·Redis 를 직접 보는 단계는 리포 루트에서 `docker-compose exec -T mysql mysql -uroot -proot <db> -e "<sql>"`, `docker-compose exec -T redis redis-cli [-n 7] <cmd>` 로 한다. (worktree 안에서는 compose 프로젝트 이름이 달라 `docker-compose -p logistics-hub exec ...` 로 지정한다.)

## 결과 보고

PR 본문의 `검증` 항목에 적는다.

- 실행한 플레이북 파일과 단계 범위. 예: `playbooks/scm-api.md 1–31 전부`, `playbooks/cross-service.md 데모 스크립트`.
- 관찰한 결과. 바뀐 동작과 관련된 단계는 상태 코드와 본문(또는 화면 내용)을 그대로 붙인다. 나머지는 "기대와 같음"으로 묶어도 된다.
- 기대와 다른 단계는 **다른 그대로** 적는다. 코드를 고치지 않았다면 `미검증` 에도 올린다.
- 돌리지 않은 플레이북은 돌리지 않았다고 쓴다. 돌리지 않은 것을 통과했다고 쓰지 않는다.

예:

```
검증: playbooks/scm-api.md 1–31 전부 기대와 같음. 22(정정 후 재고)만 본문 붙임:
  [{"sku":"CAM-01","locationCode":"SVC-SEL","status":"IN_STOCK","quantity":1}] → 200
  playbooks/cross-service.md 는 데모 스크립트로 대신함 (exit 0). web-console.md 는 돌리지 않음.
```
