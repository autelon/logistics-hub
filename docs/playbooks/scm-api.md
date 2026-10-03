# scm-api 플레이북

준비와 변수(`SCM`, `RUN`, `post`, `get`)는 [README.md](README.md). AS 이벤트 수신(28–33)에는 as-api 와 Redis 도 떠 있어야 한다.
규격: `packages/contracts/src/scm.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`.
제품 등록(`REGISTERED`), 기기 요청, 미등록 출고 이상은 [registration.md](registration.md) 에서 다룬다. 이 플레이북의 제품은 등록이 필요 없는 `NONE` 으로 등록해, 출고·배송에 "미등록 개체" 이상이 붙지 않게 한다 (`SERIAL` 제품이 등록 없이 출고되면 붙는다).

## 기준 정보

### 1. 제품 등록

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라","trackingMode":"NONE"}'
```

기대: `{"sku":"CAM-01","name":"카메라","trackingMode":"NONE"}` → 201

### 2. 같은 SKU 로 다시 등록하면 내용이 갱신된다

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라 (2세대)","trackingMode":"NONE"}'
```

기대: `{"sku":"CAM-01","name":"카메라 (2세대)","trackingMode":"NONE"}` → 201 (409 가 아니다)

### 3. 두 번째 제품

```sh
post $SCM/products '{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"}'
```

기대: `{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"}` → 201

### 4. 제품 목록 — sku 순, 갱신된 이름

```sh
get $SCM/products
```

기대: `[{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"},{"sku":"CAM-01","name":"카메라 (2세대)","trackingMode":"NONE"}]` → 200
(이전 실행이 남긴 다른 SKU 가 더 있을 수 있다. 위 둘이 이 순서로 포함되면 된다.)

### 5. 이름 되돌리기

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라","trackingMode":"NONE"}'
```

기대: `{"sku":"CAM-01","name":"카메라","trackingMode":"NONE"}` → 201

### 6. 거점 등록 (3곳)

```sh
post $SCM/locations '{"code":"FAC-SZ","name":"선전 공장","type":"FACTORY","partner":"제조사 A"}'
post $SCM/locations '{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B"}'
post $SCM/locations '{"code":"SVC-SEL","name":"서울 서비스센터","type":"SERVICE_CENTER","partner":"AS 업체 C"}'
```

기대: 각각 보낸 본문에 `policy` 가 붙은 모양 → 201. 새 거점은 능력 프로필 행이 없어도 기본값이 채워져 나온다 (34):

```text
{"code":"FAC-SZ","name":"선전 공장","type":"FACTORY","partner":"제조사 A","policy":{"reportsSerialsOnReceipt":true,"reportsSerialsOnShipment":true,"reportsSerialsOnOutbound":true,"reportsInspectionResult":false,"decidesDisposition":false,"requiresHubConfirmation":false,"unitReceiptTrigger":"PUTAWAY","autoRegisterOnPutaway":false}}
```

나머지 두 거점은 `code` `name` `type` `partner` 만 다르고 `policy` 는 같다.

### 7. 거점 목록 — code 순

```sh
get $SCM/locations
```

기대 → 200: 배열의 `code` 가 `FAC-SZ`, `SVC-SEL`, `WH-ICN` 순이고, 각 항목은 6 의 본문(`name` `type` `partner`)과 같다.
`policy` 는 셋 다 6 의 기본 프로필이다.
(이전 실행이 남긴 거점이 더 있을 수 있다. 34 이후를 돌린 DB 라면 `WH-POL-*` 도 섞여 있고 그 `policy` 는 바뀌어 있다.)

### 8. 요청 검증 실패

```sh
post $SCM/products '{"sku":"","name":"x"}'
post $SCM/locations '{"code":"X","name":"x","type":"SHOP","partner":"p"}'
```

기대 → 400, 400:

```json
{"code":"VALIDATION_FAILED","details":[{"path":"sku","message":"Too small: expected string to have >=1 characters"}]}
{"code":"VALIDATION_FAILED","details":[{"path":"type","message":"Invalid option: expected one of \"FACTORY\"|\"WAREHOUSE\"|\"SERVICE_CENTER\""}]}
```

### 9. 프레임워크 예외도 코드가 있다 — 없는 경로, 깨진 JSON

```sh
get $SCM/nope
curl -s -w '\n→ %{http_code}\n' -X POST $SCM/products -H 'content-type: application/json' -d '{"sku":'
```

기대: `{"code":"NOT_FOUND","message":"Cannot GET /nope"}` → 404, `{"code":"BAD_REQUEST","message":"Unexpected end of JSON input"}` → 400

## 사실 기록과 생애주기 (`CAM-A-$RUN`)

### 10. 처음 보는 시리얼 — sku 와 함께 MANUFACTURED

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
```

기대: `{"eventId":"<uuid>","duplicate":false}` → 201

### 11. 생애주기 — PRODUCED, 거점 FAC-SZ

```sh
get $SCM/units/CAM-A-$RUN
```

기대 → 200:

```json
{
  "serialNumber": "CAM-A-<RUN>",
  "sku": "CAM-01",
  "status": "PRODUCED",
  "locationCode": "FAC-SZ",
  "orderRef": null,
  "registeredAt": null,
  "anomalies": [],
  "events": [
    {
      "id": "<uuid>",
      "type": "MANUFACTURED",
      "occurredAt": "2026-09-01T00:00:00.000Z",
      "recordedAt": "<시각>",
      "locationCode": "FAC-SZ",
      "orderRef": null,
      "caseId": null,
      "source": { "system": "제조사 A", "ref": null },
      "note": null,
      "correction": null
    }
  ]
}
```

### 12. DISPATCHED → RECEIVED → SHIPPED(주문 참조) → DELIVERED(주문 참조 없이)

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-04T00:00:00Z\",\"orderRef\":{\"orderId\":\"ORDER-$RUN\"},\"source\":{\"system\":\"3PL B\",\"ref\":\"WMS-1\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"2026-09-05T00:00:00Z\",\"source\":{\"system\":\"택배사 D\"}}"
```

기대: 넷 다 `{"eventId":"<uuid>","duplicate":false}` → 201. (이미 아는 시리얼이라 `sku` 를 보내지 않아도 된다.)

### 13. 생애주기 — DELIVERED, 거점 없음, 출고 때의 주문 참조가 유지됨

```sh
get $SCM/units/CAM-A-$RUN
```

기대 → 200: `status` `DELIVERED`, `locationCode` `null`, `orderRef` `{"orderId":"ORDER-<RUN>","fulfillmentItemId":null}`, `anomalies` `[]`,
`events` 5개가 `occurredAt` 순 (MANUFACTURED, DISPATCHED, RECEIVED @WH-ICN, SHIPPED(orderRef 있음, source.ref `WMS-1`), DELIVERED(orderRef `null`)). 모두 `correction: null`.

### 14. 재고 집계

```sh
get $SCM/stock
```

기대 → 200: 배열에 `{"sku":"CAM-01","trackingMode":"SERIAL","locationCode":null,"status":"DELIVERED","registered":false,"lotNo":null,"stockStatus":null,"quantity":N}` 이 있다 (N 은 이 DB 에 배송 완료된 CAM-01 수. 깨끗한 DB 면 정확히 이 한 줄이고 N 은 1).
개체(`unit_events`)로 센 행은 `trackingMode` 가 `SERIAL`, `lotNo`·`stockStatus` 가 `null` 이다 — 이 플레이북의 제품은 등록이 필요 없게 `NONE` 으로 등록했지만 개체를 쌓아 쓰므로 행의 근거는 개체다.
행은 sku, 거점, 상태, 등록 여부별로 하나씩이고, 이전 실행의 제품도 집계된다. 시리얼 없는 제품의 수량 원장 행은 [warehouse.md](warehouse.md).

## 에러 코드

### 15. UNKNOWN_SKU

```sh
post $SCM/unit-events "{\"serialNumber\":\"NEW-$RUN\",\"sku\":\"NOPE-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"source\":{\"system\":\"x\"}}"
```

기대: `{"code":"UNKNOWN_SKU","message":"Unknown sku NOPE-01"}` → 422

### 16. UNKNOWN_LOCATION

```sh
post $SCM/unit-events "{\"serialNumber\":\"NEW-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"NOWHERE\",\"source\":{\"system\":\"x\"}}"
```

기대: `{"code":"UNKNOWN_LOCATION","message":"Unknown location NOWHERE"}` → 422

### 17. SKU_REQUIRED — 처음 보는 시리얼인데 sku 없음

```sh
post $SCM/unit-events "{\"serialNumber\":\"NEW-$RUN\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"source\":{\"system\":\"x\"}}"
```

기대: `{"code":"SKU_REQUIRED","message":"sku is required for new serial NEW-<RUN>"}` → 422

### 18. SERIAL_SKU_MISMATCH — 등록된 SKU 와 다른 sku

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"sku\":\"BAT-01\",\"type\":\"STORED\",\"occurredAt\":\"2026-09-06T00:00:00Z\",\"source\":{\"system\":\"x\"}}"
```

기대: `{"code":"SERIAL_SKU_MISMATCH","message":"Serial CAM-A-<RUN> is registered as CAM-01, not BAT-01"}` → 409

### 19. VALIDATION_FAILED — 없는 사실 종류

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"LOST\",\"occurredAt\":\"2026-09-06T00:00:00Z\",\"source\":{\"system\":\"x\"}}"
```

기대 → 400: `{"code":"VALIDATION_FAILED","details":[{"path":"type","message":"Invalid option: expected one of \"MANUFACTURED\"|\"DISPATCHED\"|\"RECEIVED\"|\"STORED\"|\"SHIPPED\"|\"DELIVERED\"|\"RETURN_RECEIVED\"|\"DOA_CONFIRMED\"|\"SCRAPPED\"|\"REGISTERED\""}]}`

### 20. UNIT_NOT_FOUND

```sh
get $SCM/units/NOT-EXIST-$RUN
```

기대: `{"code":"UNIT_NOT_FOUND","message":"Unit NOT-EXIST-<RUN> not found"}` → 404

### 21. 순서가 이상한 사실은 거부하지 않고 anomalies 에 표시한다

배송 완료된 제품에 거점 없는 RECEIVED 를 보고한다.

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-A-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-06T00:00:00Z\",\"source\":{\"system\":\"x\"}}"
get $SCM/units/CAM-A-$RUN
```

기대: 기록은 `{"eventId":"<uuid>","duplicate":false}` → 201. 조회 → 200 에서
`status` `IN_STOCK`, `locationCode` `null`, `orderRef` `null`,
`anomalies` `["2026-09-06T00:00:00.000Z RECEIVED: DELIVERED 상태에서 올 수 없는 사실","2026-09-06T00:00:00.000Z RECEIVED: 거점 정보 없음"]`.
이 RECEIVED 의 `eventId` 를 `BAD` 에 담아 둔다 (22 에서 쓴다).

### 22. 잘못된 사실을 무효화하면 상태와 anomalies 가 되돌아간다

```sh
post $SCM/unit-events/$BAD/corrections '{"reason":"잘못 보고된 입고","actor":"operator-1"}'
get $SCM/units/CAM-A-$RUN
```

기대: `{"correctionId":"<uuid>","replacementEventId":null}` → 201. 조회 → 200 에서 `status` `DELIVERED`, `orderRef` 가 다시 `{"orderId":"ORDER-<RUN>",…}`, `anomalies` `[]`.
`events` 에는 무효화된 RECEIVED 가 **그대로 남고** `correction` 이 `{"id":"<uuid>","reason":"잘못 보고된 입고","actor":"operator-1","recordedAt":"<시각>","replacementEventId":null}` 로 채워진다.

## 정정 (`CAM-B-$RUN`)

### 23. 입고까지 기록하고 잘못된 출고를 보고

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-04T00:00:00Z\",\"orderRef\":{\"orderId\":\"ORDER-$RUN\"},\"source\":{\"system\":\"3PL B\"}}"
```

기대: 넷 다 201. 마지막 `eventId` 를 `WRONG` 에 담는다. `get $SCM/units/CAM-B-$RUN` 의 `status` 는 `SHIPPED`.

### 24. 무효화만 (대체 없음) → 재고로 복귀

```sh
post $SCM/unit-events/$WRONG/corrections '{"reason":"창고 스캔 오류","actor":"operator-1"}'
get $SCM/units/CAM-B-$RUN
```

기대: `{"correctionId":"<uuid>","replacementEventId":null}` → 201. 조회: `status` `IN_STOCK`, `locationCode` `WH-ICN`, `orderRef` `null`, `anomalies` `[]`.
SHIPPED 사실은 남아 있고 `correction.reason` 이 `창고 스캔 오류`, `correction.replacementEventId` 가 `null`.

### 25. 같은 사실을 또 정정하면 UNIT_EVENT_ALREADY_CORRECTED

```sh
post $SCM/unit-events/$WRONG/corrections '{"reason":"다시","actor":"operator-1"}'
```

기대: `{"code":"UNIT_EVENT_ALREADY_CORRECTED","message":"Unit event <WRONG> is already corrected"}` → 409

### 26. UNIT_EVENT_NOT_FOUND, 정정 요청 검증

```sh
post $SCM/unit-events/00000000-0000-0000-0000-000000000000/corrections '{"reason":"x","actor":"y"}'
post $SCM/unit-events/$WRONG/corrections '{"reason":"","actor":"y"}'
```

기대: `{"code":"UNIT_EVENT_NOT_FOUND","message":"Unit event 00000000-0000-0000-0000-000000000000 not found"}` → 404,
`{"code":"VALIDATION_FAILED","details":[{"path":"reason","message":"Too small: expected string to have >=1 characters"}]}` → 400

### 27. 무효화 + 대체 사실 — 거점을 잘못 적은 입고를 바로잡는다

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-05T00:00:00Z\",\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-06T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
# 두 번째 eventId 를 WRONG2 에 담는다
post $SCM/unit-events/$WRONG2/corrections '{"reason":"입고 거점 오기재","actor":"operator-1","replacement":{"type":"RECEIVED","occurredAt":"2026-09-06T00:00:00Z","locationCode":"SVC-SEL"}}'
get $SCM/units/CAM-B-$RUN
get $SCM/stock
```

기대: 정정 응답 `{"correctionId":"<uuid>","replacementEventId":"<uuid>"}` → 201.
조회 → 200: `status` `IN_STOCK`, `locationCode` `SVC-SEL`. `events` 끝의 두 개는
무효화된 RECEIVED @WH-ICN (`correction.reason` `입고 거점 오기재`, `correction.replacementEventId` = 대체 사실의 id) 와
대체 RECEIVED @SVC-SEL (`source` `{"system":"logistics-hub:correction","ref":"operator-1"}`, `correction: null`).
재고 → 200 (깨끗한 DB 면 정확히 이 두 줄):

```json
[
  {
    "sku": "CAM-01",
    "trackingMode": "SERIAL",
    "locationCode": null,
    "status": "DELIVERED",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 1
  },
  {
    "sku": "CAM-01",
    "trackingMode": "SERIAL",
    "locationCode": "SVC-SEL",
    "status": "IN_STOCK",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 1
  }
]
```

WH-ICN 의 IN_STOCK 행은 없다 (CAM-B 가 대체 사실로 SVC-SEL 로 옮겨졌고 CAM-A 는 배송 완료다).

## 멱등 키

### 28. 같은 idempotencyKey 의 재전송은 한 번만 기록된다

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"STORED\",\"occurredAt\":\"2026-09-07T00:00:00Z\",\"locationCode\":\"SVC-SEL\",\"source\":{\"system\":\"AS 업체 C\"},\"idempotencyKey\":\"stored-$RUN\"}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-B-$RUN\",\"type\":\"STORED\",\"occurredAt\":\"2026-09-07T00:00:00Z\",\"locationCode\":\"SVC-SEL\",\"source\":{\"system\":\"AS 업체 C\"},\"idempotencyKey\":\"stored-$RUN\"}"
```

기대: 첫 번째 `{"eventId":"<E>","duplicate":false}` → 201, 두 번째 `{"eventId":"<같은 E>","duplicate":true}` → 201 (상태 코드도 201 이다).
`get $SCM/units/CAM-B-$RUN` 의 STORED 는 하나뿐이다.

## 아웃박스

### 29. 기록한 사실마다 outbox_events 에 한 행, 정정은 event-voided 한 행

```sh
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT JSON_EXTRACT(payload,'$.type') AS type, JSON_EXTRACT(payload,'$.payload.eventType') AS eventType, published_at IS NOT NULL AS published FROM outbox_events WHERE \`key\`='CAM-A-$RUN' ORDER BY id"
```

(서브에이전트는 `lh_scm` 대신 자기 DB.) 기대: 7행, 모두 `topic` `scm.unit-events`, `published` 1 —
`event-recorded` × MANUFACTURED, DISPATCHED, RECEIVED, SHIPPED, DELIVERED, RECEIVED(21 의 것) 순서, 그다음 `event-voided` × RECEIVED(22 의 정정).
무효화와 대체를 함께 한 27 은 같은 키(`CAM-B-$RUN`)에 `event-voided` 다음 `event-recorded` 순으로 적힌다.

## AS 이벤트 수신 (as-api + Redis 필요)

### 30. AS 가 DOA 를 확정하면 DOA_CONFIRMED 사실이 기록된다

```sh
post $AS/cases "{\"serialNumber\":\"CAM-A-$RUN\",\"origin\":\"SALES\",\"symptom\":\"전원이 켜지지 않음\"}"
# 응답 id 를 CASE 에 담는다
post $AS/cases/$CASE/confirm-doa '{"disposition":"SCRAP"}'
# 잠시 뒤
get $SCM/units/CAM-A-$RUN
```

기대: 접수 201, 확정 200 (as-api 의 응답은 [as-api.md](as-api.md)). 조회 → 200: `status` `DOA`, `events` 마지막이

```json
{
  "id": "<uuid>",
  "type": "DOA_CONFIRMED",
  "occurredAt": "<확정 응답의 confirmedAt>",
  "recordedAt": "<시각>",
  "locationCode": null,
  "orderRef": null,
  "caseId": "<CASE>",
  "source": { "system": "as-api", "ref": "<CASE>" },
  "note": "SALES / SCRAP",
  "correction": null
}
```

### 31. 같은 메시지가 다시 와도 한 번만 기록된다 (idempotency_key = `message:<이벤트 id>`)

Redis 스트림의 마지막 메시지를 그대로 다시 넣는다.

```sh
VALUE=$(docker-compose exec -T redis redis-cli --raw XREVRANGE as.case-events + - COUNT 1 | sed -n 5p)
docker-compose exec -T redis redis-cli XADD as.case-events '*' key CAM-A-$RUN value "$VALUE"
# 잠시 뒤
get $SCM/units/CAM-A-$RUN
```

(서브에이전트는 `redis-cli -n 7`.) 기대: `DOA_CONFIRMED` 사실이 여전히 하나. 로그에는 아무것도 남지 않는다 (조용히 무시).

### 32. 폐기 → SCRAPPED

```sh
post $AS/cases/$CASE/scrap '{}'
# 잠시 뒤
get $SCM/units/CAM-A-$RUN
```

기대: `status` `SCRAPPED`, `events` 마지막이 `type` `SCRAPPED`, `caseId` `<CASE>`, `source` `{"system":"as-api","ref":"<CASE>"}`, `note` `null`.

### 33. 모르는 시리얼의 DOA 는 기록하지 않고 error 로그만 남긴다

```sh
post $AS/cases "{\"serialNumber\":\"GHOST-$RUN\",\"origin\":\"SALES\",\"symptom\":\"소리가 안 남\"}"
post $AS/cases/<응답 id>/confirm-doa '{"disposition":"RETURN_TO_VENDOR"}'
# 잠시 뒤 scm-api 로그
```

기대: scm-api 로그에 `ERROR [AsCaseEventsConsumer] as.doa.confirmed for unknown serial GHOST-<RUN> (case <id>)` 한 줄. `get $SCM/units/GHOST-$RUN` 은 404 `UNIT_NOT_FOUND`. 재시도하지 않는다 (같은 줄이 반복되지 않는다).

## 거점 능력 프로필 (`WH-POL-$RUN`)

거점마다 "무엇을 보고해 주고 무엇을 정하는가"를 값으로 둔 프로필이다 (`docs/06-inbound-design.md` "정책 변경 지점"). 이 단계들은 scm-api 만 있으면 된다.
`DB` 를 직접 보는 단계는 서브에이전트라면 `lh_scm` 대신 자기 DB 를 쓴다.

### 34. 새 거점은 기본 프로필이고, 프로필 행도 이력도 없다

```sh
post $SCM/locations "{\"code\":\"WH-POL-$RUN\",\"name\":\"정책 시험 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}"
get $SCM/locations/WH-POL-$RUN/policy/changes
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT COUNT(*) AS rows_for_location FROM location_policies p JOIN locations l ON l.id = p.location_id WHERE l.code = 'WH-POL-$RUN'"
```

기대: 201 —

```text
{"code":"WH-POL-<RUN>","name":"정책 시험 창고","type":"WAREHOUSE","partner":"3PL B","policy":{"reportsSerialsOnReceipt":true,"reportsSerialsOnShipment":true,"reportsSerialsOnOutbound":true,"reportsInspectionResult":false,"decidesDisposition":false,"requiresHubConfirmation":false,"unitReceiptTrigger":"PUTAWAY","autoRegisterOnPutaway":false}}
```

이력 `[]` → 200. DB 의 `rows_for_location` 은 `0` (행이 없어도 기본값으로 동작한다).

### 35. 일부 항목만 바꾼다 — 나머지는 그대로, 행이 처음 생긴다

```sh
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-kim","reportsSerialsOnReceipt":false,"unitReceiptTrigger":"GOODS_RECEIPT"}'
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT p.reports_serials_on_receipt, p.unit_receipt_trigger, p.decides_disposition, p.updated_by FROM location_policies p JOIN locations l ON l.id = p.location_id WHERE l.code = 'WH-POL-$RUN'"
```

기대: 해석된 프로필 전체 → 200 (`put` 은 `post` 와 같되 `-X PUT`).

```text
{"reportsSerialsOnReceipt":false,"reportsSerialsOnShipment":true,"reportsSerialsOnOutbound":true,"reportsInspectionResult":false,"decidesDisposition":false,"requiresHubConfirmation":false,"unitReceiptTrigger":"GOODS_RECEIPT","autoRegisterOnPutaway":false}
```

DB 는 한 행: `0  GOODS_RECEIPT  0  ops-kim`.

### 36. 두 번째 변경은 앞의 값을 유지하고, 거점 목록에도 반영된다

```sh
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-lee","decidesDisposition":true,"reportsSerialsOnReceipt":true}'
get $SCM/locations
```

기대: 첫 줄 → 200, `reportsSerialsOnReceipt` 가 다시 `true`, `decidesDisposition` 이 `true`, `unitReceiptTrigger` 는 35 에서 바꾼 `GOODS_RECEIPT` 그대로, 나머지는 기본값.
목록 → 200: `WH-POL-<RUN>` 의 `policy` 가 같은 값이고, 다른 거점(`FAC-SZ` 등)의 `policy` 는 기본 프로필 그대로.

### 37. 변경 이력 — 최신순, 기본값이 채워진 before·after

```sh
get $SCM/locations/WH-POL-$RUN/policy/changes
```

기대 → 200: 2건. 첫 건은 `actor` `ops-lee`, 둘째는 `ops-kim`. `changedAt` 은 ISO 시각.
`ops-kim` 의 `before` 는 기본 프로필(`reportsSerialsOnReceipt` `true`, `unitReceiptTrigger` `PUTAWAY`)이고 `after` 는 35 의 응답과 같다.
`ops-lee` 의 `before` 는 35 의 응답, `after` 는 36 의 응답과 같다. 키 순서는 프로필 응답과 같다 (`reportsSerialsOnReceipt` 부터 `autoRegisterOnPutaway` 까지).

### 38. 바뀌는 것이 없는 요청은 이력을 남기지 않고, 거점 재등록은 프로필을 건드리지 않는다

```sh
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-lee","decidesDisposition":true}'
post $SCM/locations "{\"code\":\"WH-POL-$RUN\",\"name\":\"정책 시험 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}"
curl -s $SCM/locations/WH-POL-$RUN/policy/changes | jq -c 'map(.actor)'
```

기대: 첫 줄 → 200 (36 의 응답 그대로), 둘째 → 201 (`policy` 는 36 의 값 그대로), 이력의 `actor` 는 `["ops-lee","ops-kim"]` — 여전히 2건.

### 39. 모르는 거점은 UNKNOWN_LOCATION

```sh
put $SCM/locations/NOWHERE/policy '{"actor":"ops-kim","decidesDisposition":true}'
get $SCM/locations/NOWHERE/policy/changes
```

기대: 둘 다 `{"code":"UNKNOWN_LOCATION","message":"Unknown location NOWHERE"}` → 422.

### 40. 잘못된 변경 요청은 거절되고 아무것도 바뀌지 않는다

```sh
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-kim"}'
put $SCM/locations/WH-POL-$RUN/policy '{"decidesDisposition":false}'
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-kim","unitReceiptTrigger":"NEVER"}'
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-kim","decidesDisposition":"no"}'
put $SCM/locations/WH-POL-$RUN/policy '{"actor":"ops-kim","decideDisposition":false}'
curl -s $SCM/locations/WH-POL-$RUN/policy/changes | jq -c 'map(.actor)'
```

기대: 모두 400 `VALIDATION_FAILED`, `details` 는 차례로

```text
[{"path":"","message":"At least one policy field is required"}]
[{"path":"actor","message":"Invalid input: expected string, received undefined"}]
[{"path":"unitReceiptTrigger","message":"Invalid option: expected one of \"GOODS_RECEIPT\"|\"PUTAWAY\""}]
[{"path":"decidesDisposition","message":"Invalid input: expected boolean, received string"}]
[{"path":"","message":"Unrecognized key: \"decideDisposition\""},{"path":"","message":"At least one policy field is required"}]
```

(모르는 항목은 오타일 수 있어 거절한다.) 이력은 여전히 `["ops-lee","ops-kim"]`.

### 41. 같은 거점의 동시 변경은 서로 덮어쓰지 않는다

```sh
CODE=WH-CONC-$RUN
post $SCM/locations "{\"code\":\"$CODE\",\"name\":\"동시성 시험 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}"
for f in reportsSerialsOnReceipt reportsSerialsOnShipment reportsSerialsOnOutbound reportsInspectionResult decidesDisposition requiresHubConfirmation autoRegisterOnPutaway; do
  v=true; case $f in reportsSerialsOn*) v=false;; esac
  curl -s -o /dev/null -w "$f %{http_code}\n" -X PUT $SCM/locations/$CODE/policy -H 'content-type: application/json' -d "{\"actor\":\"$f\",\"$f\":$v}" &
done
wait
curl -s $SCM/locations/$CODE/policy/changes | jq 'length'
curl -s $SCM/locations/$CODE/policy/changes | jq 'reverse as $c | [range(1; $c|length)] | map($c[.].before == $c[.-1].after) | all'
curl -s $SCM/locations | jq -c ".[] | select(.code==\"$CODE\") | .policy"
```

기대: 일곱 요청 모두 200. 이력은 `7`건이고, 오래된 순으로 놓았을 때 각 건의 `before` 가 앞 건의 `after` 와 같다 (`true`).
최종 프로필에는 일곱 변경이 모두 들어 있다: 앞 세 항목(`reportsSerialsOn*`)은 `false`, `reportsInspectionResult` `decidesDisposition` `requiresHubConfirmation` `autoRegisterOnPutaway` 는 `true`, `unitReceiptTrigger` 는 `PUTAWAY`.
(잠금보다 먼저 일반 읽기를 하면 스냅샷이 잠금 전에 잡혀 먼저 커밋된 변경을 못 보고 덮어쓴다. 이력은 7건이어도 연결 검사가 `false` 이고 최종 프로필에서 변경이 빠진다.)

### 42. 서로 다른 새 거점의 첫 변경이 동시에 와도 교착하지 않는다

```sh
for n in 1 2 3 4 5 6; do
  post $SCM/locations "{\"code\":\"WH-DL-$RUN-$n\",\"name\":\"교착 시험 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}" > /dev/null
done
for n in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code} " -X PUT $SCM/locations/WH-DL-$RUN-$n/policy -H 'content-type: application/json' -d '{"actor":"ops-kim","decidesDisposition":true}' &
done
wait; echo
```

기대: `200 200 200 200 200 200` (순서는 다를 수 있다). 프로필 행이 아직 없는 거점의 행을 `FOR UPDATE` 로 읽으면 같은 인덱스 갭에 락이 겹쳐 일부가 교착으로 `500` 이 된다.
이를 피하려고 변경 트랜잭션은 첫 쿼리로 거점 행만 잠그고, 프로필은 일반 읽기로 읽는다.

## 동시 중복 (`CONC-*-$RUN`)

### 43. 같은 idempotencyKey 의 보고가 동시에 와도 하나만 기록되고 나머지는 중복이다

5개를 동시에 보낸다. 시리얼이 이미 있는 경우(A)와 처음 보는 경우(B) 둘 다 본다.

```sh
ev() { echo "{\"serialNumber\":\"$1\",\"sku\":\"CAM-01\",\"type\":\"STORED\",\"occurredAt\":\"2026-10-01T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"wms-a\"},\"idempotencyKey\":\"$2\"}"; }
conc() { seq 5 | xargs -P5 -I{} sh -c 'echo "$(curl -s -w " → %{http_code}" -X POST "$0" -H "content-type: application/json" -d "$1")"' "$1" "$2" | sort; }
post $SCM/unit-events "$(ev CONC-A-$RUN seed-$RUN)" > /dev/null    # A 의 시리얼을 먼저 만든다
echo "# A. 이미 있는 시리얼"; conc $SCM/unit-events "$(ev CONC-A-$RUN conc-a-$RUN)"
echo "# B. 처음 보는 시리얼"; conc $SCM/unit-events "$(ev CONC-B-$RUN conc-b-$RUN)"
docker-compose exec -T mysql mysql -uroot -proot lh_scm -N -e "SELECT idempotency_key, COUNT(*) FROM unit_events WHERE idempotency_key IN ('conc-a-$RUN','conc-b-$RUN') GROUP BY idempotency_key; SELECT COUNT(*) FROM units WHERE serial_number='CONC-B-$RUN'"
```

(서브에이전트는 `lh_scm` 대신 자기 DB. `CAM-01` 과 `WH-ICN` 은 1·6 에서 만든 것.) 기대: A, B 모두 5개가 `→ 201` 이고 `500` 은 없다.
`duplicate` 는 `false` 하나와 `true` 넷이며 `eventId` 는 다섯 모두 같다 (`sort` 때문에 줄 순서가 다를 수 있다).

```text
{"eventId":"<E>","duplicate":false} → 201
{"eventId":"<같은 E>","duplicate":true} → 201   (× 4)
```

DB: `conc-a-<RUN>` 1행, `conc-b-<RUN>` 1행, 그리고 `CONC-B-<RUN>` 시리얼 1행 (`1`).

- A 에서 진 쪽은 사실 INSERT 가 `unit_events` 의 idempotency_key 고유 키 위반(MySQL 1062)으로 실패한다.
- B 에서 진 쪽은 없는 시리얼의 틈을 `FOR UPDATE` 로 함께 잡았다가 시리얼 INSERT 에서 교착(MySQL 1213)으로 희생된다.
- 어느 쪽이든 usecase 가 롤백된 뒤 요청을 처음부터 다시 하고, 다시 할 때는 먼저 커밋된 사실이 보여 중복으로 돌려준다.
- 고치기 전에는 A, B 모두 하나만 `201`, 나머지 넷은 `500 {"code":"INTERNAL_ERROR"}` 였다.
