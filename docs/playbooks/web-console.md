# 웹 콘솔 플레이북

브라우저로 네 화면(제품 추적, 재고, 주문, 제품 등록)을 확인한다. 에이전트는 **Claude in Chrome** 으로 조작하고, 화면 내용은 페이지 텍스트(접근성 트리)로 읽어 비교한다. 스크린샷은 보조다.
데이터는 [scm-api.md](scm-api.md) 1–28 과 [oms-api.md](oms-api.md) 1–17 을 같은 `RUN` 으로 먼저 돌려 만든다.

## 준비

- 기본: `pnpm dev` 가 띄운 `http://localhost:5173`. 개발 서버가 `/api/scm`·`/api/oms`·`/api/as` 를 3001·3002·3003 으로 넘긴다 (`apps/web/vite.config.ts`).
- 서브에이전트(자기 포트로 서비스를 띄운 경우): 프록시 대상이 설정 파일에 고정되어 있으므로 **임시 설정 파일**로 띄운다. `apps/web/vite.config.ts` 를 복사해 `server.port` 와 세 `service(...)` 의 포트만 자기 것으로 바꾼 `apps/web/vite.<작업>.config.ts` 를 만들고
  `cd apps/web && mise exec -- node node_modules/vite/bin/vite.js --config vite.<작업>.config.ts` 로 띄운다. **커밋하지 않고 끝나면 지운다.**
- 시각은 브라우저 로캘(`ko-KR`)로 표시된다. 아래 기대값은 `Asia/Seoul` 기준이다 (`2026-09-01T00:00:00Z` → `2026. 9. 1. 오전 9:00`).

### 1. 제품 추적 — 정정이 반영된 이력

`http://localhost:5173/?sn=CAM-B-<RUN>` 을 연다.

기대 화면 (페이지 텍스트 순서대로):

- 머리: `CAM-B-<RUN>`, 상태 배지 `IN_STOCK`, `SKU CAM-01`, `거점 SVC-SEL`, `미등록` (등록되었으면 `등록 <시각>`). anomalies 가 없으므로 노란 경고 상자가 없다.
- `이력` 카드에 8줄, `occurredAt` 순:
  1. `MANUFACTURED` `2026. 9. 1. 오전 9:00` `@ FAC-SZ` `출처 제조사 A` + 버튼 `잘못된 기록으로 표시`
  2. `DISPATCHED` `2026. 9. 2. 오전 9:00` `출처 제조사 A` + 버튼
  3. `RECEIVED` `2026. 9. 3. 오전 9:00` `@ WH-ICN` `출처 3PL B` + 버튼
  4. `SHIPPED` `2026. 9. 4. 오전 9:00` `주문 ORDER-<RUN>` `출처 3PL B` — **버튼 없음**, 흐리게·취소선, 아래에 `<시각> operator-1 님이 무효 처리: 창고 스캔 오류`
  5. `DISPATCHED` `2026. 9. 5. 오전 9:00` `출처 3PL B` + 버튼
  6. `RECEIVED` `2026. 9. 6. 오전 9:00` `@ WH-ICN` `출처 3PL B` — 버튼 없음, 아래에 `<시각> operator-1 님이 무효 처리: 입고 거점 오기재 (대체 기록 있음)`
  7. `RECEIVED` `2026. 9. 6. 오전 9:00` `@ SVC-SEL` `출처 logistics-hub:correction` + 버튼
  8. `STORED` `2026. 9. 7. 오전 9:00` `@ SVC-SEL` `출처 AS 업체 C` + 버튼

### 2. 정정 UI — 사실을 무효 처리한다

1. 8번째 줄(STORED)의 `잘못된 기록으로 표시` 를 누른다.
   기대: 그 줄 아래에 입력 `사유`, 입력 `처리자`, 버튼 `무효 처리`, 버튼 `취소` 가 나타난다.
2. `사유` 에 `테스트 기록`, `처리자` 에 `web-tester` 를 넣고 `무효 처리` 를 누른다.
   기대: 폼이 닫히고 목록이 다시 조회된다. STORED 줄에서 버튼이 사라지고 흐리게·취소선이 되며 아래에 `<지금 시각> web-tester 님이 무효 처리: 테스트 기록` 이 보인다. 머리의 상태는 `IN_STOCK`, 거점 `SVC-SEL` 그대로.
3. (API 로 확인) `get $SCM/units/CAM-B-$RUN` 의 STORED 사실에 `correction.actor` `web-tester`.
4. `취소` 동작: 다른 줄의 버튼을 눌러 폼을 열고 `취소` 를 누르면 폼만 닫히고 아무것도 바뀌지 않는다.

같은 사실에 두 번째 정정은 UI 에서 할 수 없다 (버튼이 없다). API 의 409 는 [scm-api.md](scm-api.md) 25.

### 3. 제품 추적 — 이상(anomaly) 표시와 없는 시리얼

- `?sn=CAM-C-<RUN>` ([oms-api.md](oms-api.md) 14 이후): 머리 아래 노란 상자에 `⚠ 2026-09-12T00:00:00.000Z DELIVERED: IN_STOCK 상태에서 올 수 없는 사실` 한 줄. 머리에는 `거점` 이 없다 (`DELIVERED` 는 거점을 비운다). 이 제품은 `NONE` 제품이라 "미등록 개체" 이상은 붙지 않는다 (`SERIAL` 제품이 등록 없이 출고되면 [registration.md](registration.md) 4 처럼 붙는다).
- `?sn=NOT-EXIST-<RUN>`: 본문에 `불러오지 못했습니다: Unit NOT-EXIST-<RUN> not found` 만 보인다.
- `/` (sn 없음): `시리얼 번호로 제품 한 개의 제조부터 폐기까지 전체 이력을 조회합니다.` 안내문. 입력란에 시리얼을 넣고 `조회` 를 누르면 주소가 `/?sn=<입력>` 으로 바뀌고 이력이 뜬다.

### 4. 재고

`/stock` 을 연다. 기대: 카드 제목 `SKU · 거점 · 상태별 수량 (정정 반영)`, 표 머리 `SKU 추적 거점 상태 등록 로트 재고 상태 수량`.
행은 `get $SCM/stock` 의 배열과 같은 순서·같은 값이고, 거점이 `null` 이면 `—`, `registered` 가 `false` 면 `미등록`(`true` 면 `등록` 배지, 수량 제품처럼 `null` 이면 `—`)으로 보인다. `추적` 은 `trackingMode` 배지, `로트` 는 `lotNo`(없으면 `—`), `재고 상태` 는 `stockStatus` 배지(시리얼 행은 `—`)다. 시리얼 행이 먼저, 수량 행이 그다음이다 ([warehouse.md](warehouse.md) 14 의 데이터를 넣었다면 `WH-L` 행 셋에 로트 `—`·`LOT-1`·`LOT-1`, 재고 상태 `AVAILABLE`·`AVAILABLE`·`QC`, 수량 `-5` 가 음수 그대로 보인다). 예 (이 DB 에 플레이북 데이터만 있을 때):

```
CAM-01  SERIAL  —        DELIVERED  미등록  —  —  2     ← CAM-A (scm-api.md 22 뒤), CAM-C (oms-api.md 14: 출고 무효화 뒤 배송 완료만 남아도 거점은 비어 있다)
CAM-01  SERIAL  —        DOA        미등록  —  —  1     ← CAM-D (oms-api.md 17 에서 DOA 확정)
CAM-01  SERIAL  SVC-SEL  IN_STOCK   미등록  —  —  1     ← CAM-B
```

(이 제품들은 `NONE` 이라 등록하지 않는다. 등록된 행은 아래 7 에서.)

배송 완료·DOA 행의 거점이 `—` 이고, `WH-ICN` 행은 없다 (거점에 `DELIVERED` 가 남지 않는다).

행이 없으면 `아직 데이터가 없습니다` 류의 빈 상태 문구가 보인다 (`QueryState`).

### 5. 주문

`/orders` 를 연다. 기대: 최신 주문이 위. `N-<RUN>` 카드 ([oms-api.md](oms-api.md) 17 뒤 기준):

- 머리: `naver-smartstore · N-<RUN>`, 배지 `OPEN`, `2026. 9. 10. 오전 9:00`
- `카메라 스타터 키트 × 1` + `패키지` 표시, 항목 3줄:
  - `BAT-01` `PENDING` `시리얼 미정`
  - `CAM-01` `DOA` `CAM-D-<RUN>` (시리얼은 `/?sn=CAM-D-<RUN>` 으로 가는 링크)
  - `CAM-01` `PENDING` `시리얼 미정` `DOA 교체 출고`
- `배터리 2개입 × 1` + `패키지`, 항목 2줄 모두 `BAT-01` `PENDING` `시리얼 미정`

시리얼 링크를 누르면 제품 추적 화면으로 가고 입력란에 그 시리얼이 채워져 있다.

### 6. 제품 등록 화면

[registration.md](registration.md) 1–3 으로 만든 데이터에 이어서(같은 `RUN`) 한다. 등록 화면용으로 입고된 개체를 더 만든다.

```sh
for s in UI-1-$RUN UI-2-$RUN-FAIL UI-3-$RUN; do receive $s CAM-01; done
```

`/register` 를 연다. 기대 (페이지 텍스트 순서대로):

- 카드 `제품 등록`: 큰 입력란(`시리얼 번호 목록`, 힌트 `등록할 시리얼 번호 (줄바꿈, 공백, 쉼표로 구분)`), 입력 `처리자`, 버튼 `제품 등록하기`, 옆에 `0건 (한 번에 최대 5000건)`. 시리얼을 입력하면 건수가 바뀐다 (중복은 한 번으로 센다).
- 카드 `기기 요청 (최근 50건)`: 요청 한 줄에 종류(`REGISTER`/`DEACTIVATE`), 상태 배지, `<성공>/<전체> 성공`, 실패가 있으면 `실패 N건` 버튼, 시각, `<사유> · <처리자>`. 결과가 다 올 때까지는 2초마다 다시 조회한다.

1. 입력란에 두 줄을 넣는다: `UI-1-<RUN> UI-2-<RUN>-FAIL` 과 `UI-3-<RUN>, GHOST-ui, REG-SHIP-<RUN>, REG-BAT-<RUN>, REG-E-<RUN>` (`REG-*` 는 registration.md 3·5 의 것). `처리자` 에 `web-operator`. 건수는 `7건`.
2. `제품 등록하기` 를 누른다. 기대: 입력란 아래에
   - `등록 3건` 과 `기기 요청 <uuid>`
   - `제외 4건` 과 노란 상자 네 줄: `GHOST-ui — 모르는 시리얼 (UNIT_NOT_FOUND)`, `REG-SHIP-<RUN> — 재고(IN_STOCK)가 아님 (NOT_IN_STOCK)`, `REG-BAT-<RUN> — 시리얼 추적 제품이 아님 (NOT_SERIAL_TRACKED)`, `REG-E-<RUN> — 이미 등록됨 (ALREADY_REGISTERED)`
3. 몇 초 안에 `기기 요청` 의 맨 윗줄이 `REGISTER` `PARTIALLY_FAILED` `2/3 성공` `실패 1건` `<시각>` `REGISTRATION · web-operator` 가 된다.
4. `실패 1건` 을 누른다. 기대: 그 줄 아래에 `UI-2-<RUN>-FAIL — simulated failure (serial ends with -FAIL)`.

### 7. 재고의 등록 열 · 제품 추적의 등록 표시

- `/stock`: 6 뒤에 인천 창고 `IN_STOCK` 행이 `미등록` 과 `등록` 배지로 나뉘어 보인다 (registration.md 3·5·6 과 6 을 모두 한 DB 에 했다면 `CAM-01 WH-ICN IN_STOCK 등록` 에 등록된 개체 수가 모인다).
- `/?sn=REG-A-<RUN>` (registration.md 13–14 뒤): 머리에 `DELIVERED`, `SKU CAM-01`, `주문 ORDER-<RUN>`, `등록 <시각>`. 이력에 `REGISTERED` 줄(`출처 logistics-hub`)이 있고 `잘못된 기록으로 표시` 버튼이 있다 — 눌러서 무효화하면 registration.md 15 와 같이 `registeredAt` 이 비워지고 DEACTIVATE 요청이 생긴다.
