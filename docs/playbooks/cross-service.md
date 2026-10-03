# 서비스 간 흐름 플레이북

제품 한 개가 제조되어 패키지 주문으로 나가고, 잘못된 출고 보고가 정정되고, DOA 로 폐기되고, 교체품이 다시 나가기까지를 세 서비스를 가로질러 확인한다.
`scripts/demo.mjs` 가 같은 흐름을 자동으로 돌리므로 **지름길**로 먼저 쓰고, 어디서 틀어졌는지 봐야 할 때 아래 단계를 손으로 한다.

준비와 변수(`SCM`, `OMS`, `AS`, `RUN`, `post`, `get`)는 [README.md](README.md). 세 서비스와 MySQL, Redis 가 모두 떠 있어야 하고 `REDIS_URL` 이 비어 있으면 안 된다
(비어 있으면 인메모리 버스라 서비스 사이로 전달되지 않는다).

## 지름길: 데모 스크립트

```sh
mise run demo                      # 3001-3003
SCM_URL=http://localhost:3101 OMS_URL=http://localhost:3102 AS_URL=http://localhost:3103 node scripts/demo.mjs   # 자기 포트
echo $?
```

기대: 아홉 개의 `▶` 단계가 멈추지 않고 지나가고, 끝에 표 두 개 — 생애주기 8행(MANUFACTURED, DISPATCHED, RECEIVED, SHIPPED(출처 `logistics-hub:correction`), DELIVERED, DOA_CONFIRMED(케이스 있음), RETURN_RECEIVED @SVC-SEL, SCRAPPED(케이스 있음)) 과 `최종 상태: SCRAPPED, 이상: 0건`,
주문 항목 3행(BAT-01 DELIVERED / CAM-01 DOA / CAM-01 DELIVERED `DOA_REPLACEMENT`) 과 `주문 상태: FULFILLED`. 종료 코드 **0**.
중간에 기대 상태가 되지 않으면 `기다리다 포기: <무엇>` 또는 `<경로> → <상태> <본문>` 으로 던지고 종료 코드 **1** (서비스 하나가 꺼져 있을 때 확인함).

## 수동 단계

시리얼은 `CAM-A-$RUN`, `CAM-B-$RUN`, `BAT-A-$RUN`. 주문은 `N-$RUN`.

### 1. 기준 정보

[scm-api.md](scm-api.md) 1, 3, 6 (제품 CAM-01·BAT-01, 거점 3곳) 과 [oms-api.md](oms-api.md) 3 (KIT-01 = CAM-01 ×1 + BAT-01 ×1). 모두 201.

### 2. 세 제품을 제조 → 이동 → 인천 창고 입고

세 시리얼 각각에 대해 (sku 는 CAM-A·CAM-B 가 `CAM-01`, BAT-A 가 `BAT-01`):

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
```

기대: 9건 모두 201. `get $SCM/stock` 에 `{"sku":"CAM-01","locationCode":"WH-ICN","status":"IN_STOCK","quantity":≥2}`, `{"sku":"BAT-01","locationCode":"WH-ICN","status":"IN_STOCK","quantity":≥1}`.

### 3. 키트 1개 주문

```sh
post $OMS/orders "{\"channel\":\"naver-smartstore\",\"channelOrderNo\":\"N-$RUN\",\"orderedAt\":\"2026-09-10T00:00:00Z\",\"lines\":[{\"sellableCode\":\"KIT-01\",\"quantity\":1}]}"
# orderId 를 ORDER 에 담는다
get $OMS/orders/$ORDER
```

기대: 201. 조회에서 줄 하나에 항목 둘 — `BAT-01 PENDING`, `CAM-01 PENDING`, 시리얼 모두 `null`, `status` `OPEN`.

### 4. 창고가 출고를 보고하는데 카메라 시리얼을 잘못 찍었다 (실제 CAM-A, 보고는 CAM-B)

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-11T00:00:00Z\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"3PL B\"}}"
# eventId 를 WRONG 에 담는다
post $SCM/unit-events "{\"serialNumber\":\"BAT-A-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-11T00:00:00Z\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"3PL B\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
```

기대: OMS 의 CAM-01 항목에 `"status":"SHIPPED","serialNumber":"CAM-B-<RUN>"`, BAT-01 항목에 `"serialNumber":"BAT-A-<RUN>"`.

**전달 확인** (이 단계에서 OMS 가 바뀌지 않으면 어디서 멈췄는지 찾는다):

```sh
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT COUNT(*) AS unpublished FROM outbox_events WHERE published_at IS NULL"
docker-compose exec -T redis redis-cli XINFO GROUPS scm.unit-events
docker-compose exec -T mysql mysql -uroot -proot lh_oms -e "SELECT COUNT(*) AS n FROM processed_messages WHERE consumer_group='oms-api'"
```

- `unpublished` 가 0 이 아니고 줄지 않으면 scm-api 의 릴레이가 발행하지 못하는 것 (scm-api 로그 `[outbox] relay failed`, Redis 연결).
- `XINFO GROUPS` 에 `oms-api` 그룹이 있고 `pending` 0, `lag` 0 이어야 한다. 그룹이 없으면 oms-api 가 구독하지 않은 것(기동 로그, `REDIS_URL`). `pending` 이 줄지 않으면 oms-api 핸들러가 실패해 재시도 중 (oms-api 로그 `[messaging] handler scm.unit-events/oms-api ...`).
- `processed_messages` 는 주문 참조가 있는 SHIPPED·DELIVERED 메시지마다 1씩 는다 (주문과 무관한 사실은 기록하지 않는다).

### 5. 정정 — CAM-B 출고를 무효화하고 실제로 나간 CAM-A 의 출고를 기록

```sh
post $SCM/unit-events/$WRONG/corrections '{"reason":"창고 스캔 오류. 실물 확인 결과 CAM-A 가 출고됨","actor":"demo-operator"}'
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-12T00:00:00Z\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"logistics-hub:correction\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
get $SCM/units/CAM-B-$RUN
```

기대: OMS 의 CAM-01 항목이 `"serialNumber":"CAM-A-<RUN>"` (CAM-B 는 어느 항목에도 없다). SCM 의 CAM-B 는 `status` `IN_STOCK`, `locationCode` `WH-ICN` (재고로 복귀).
무효화(`event-voided`)가 대체 기록(`event-recorded`)보다 **먼저** 전달되어야 항목이 PENDING 으로 돌아갔다가 다시 붙는다. 순서는 아웃박스 `id` 순이다 ([scm-api.md](scm-api.md) 29).

### 6. 배송 완료 (택배사는 주문 정보 없이 보고)

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"2026-09-13T00:00:00Z\",\"source\":{\"system\":\"택배사 D\"}}"
post $SCM/unit-events "{\"serialNumber\":\"BAT-A-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"2026-09-13T00:00:00Z\",\"source\":{\"system\":\"택배사 D\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
```

기대: 두 항목 모두 `DELIVERED`, 주문 `status` `FULFILLED`.

### 7. 고객이 초기 불량 접수 → AS 가 DOA 확정(폐기 처분)

```sh
post $AS/cases "{\"serialNumber\":\"CAM-A-$RUN\",\"origin\":\"SALES\",\"symptom\":\"전원이 켜지지 않음\"}"
# id 를 CASE 에 담는다
post $AS/cases/$CASE/confirm-doa '{"disposition":"SCRAP"}'
# 잠시 뒤
get $SCM/units/CAM-A-$RUN
get $OMS/orders/$ORDER
```

기대: SCM `status` `DOA`, 마지막 사실 `DOA_CONFIRMED` (`caseId` = CASE, `note` `SALES / SCRAP`).
OMS: CAM-A 항목 `"status":"DOA","doaCaseId":"<CASE>"`, 새 항목 `{"sku":"CAM-01","status":"PENDING","reason":"DOA_REPLACEMENT","replacesItemId":"<DOA 항목 id>"}`, 주문 `status` 는 다시 `OPEN`.
전달 확인은 4 와 같되 스트림 `as.case-events` 에는 그룹이 **둘**(`scm-api`, `oms-api`) 있어야 한다. 아웃박스는 `lh_as`.

### 8. 불량품 회수 → 서비스센터에서 폐기

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"RETURN_RECEIVED\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"locationCode\":\"SVC-SEL\",\"source\":{\"system\":\"AS 업체 C\"}}"
post $AS/cases/$CASE/scrap '{}'
# 잠시 뒤
get $SCM/units/CAM-A-$RUN
```

기대: `status` `SCRAPPED`, `anomalies` `[]`, 사실 순서가 … DOA_CONFIRMED, RETURN_RECEIVED @SVC-SEL, SCRAPPED. (AS 가 찍는 시각은 현재 시각이라, 회수 시각도 현재 시각으로 보내야 이 순서가 된다. 과거 날짜로 보내면 RETURN_RECEIVED 가 DOA_CONFIRMED 앞에 놓이고, 그래도 `anomalies` 는 없다 — DELIVERED→RETURNED→DOA 도 허용되는 전이다.)

### 9. 교체품 CAM-B 출고 → 배송 완료

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"source\":{\"system\":\"택배사 D\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
```

기대: DOA_REPLACEMENT 항목이 `"status":"DELIVERED","serialNumber":"CAM-B-<RUN>"`, 주문 `status` `FULFILLED`. 항목은 셋: `BAT-01 DELIVERED BAT-A`, `CAM-01 DOA CAM-A`, `CAM-01 DELIVERED CAM-B (DOA_REPLACEMENT)`.

### 10. 웹 콘솔로 같은 결과 확인 (선택)

`/?sn=CAM-A-<RUN>` 에 사실 8줄과 배지 `SCRAPPED`, `/orders` 의 `N-<RUN>` 카드에 배지 `FULFILLED` 와 `DOA 교체 출고` 표시. 화면 기대값은 [web-console.md](web-console.md).
