# scm-api 플레이북

준비와 변수(`SCM`, `RUN`, `post`, `get`)는 [README.md](README.md). AS 이벤트 수신(28–33)에는 as-api 와 Redis 도 떠 있어야 한다.
규격: `packages/contracts/src/scm.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`.

## 기준 정보

### 1. 제품 등록

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라"}'
```

기대: `{"sku":"CAM-01","name":"카메라"}` → 201

### 2. 같은 SKU 로 다시 등록하면 내용이 갱신된다

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라 (2세대)"}'
```

기대: `{"sku":"CAM-01","name":"카메라 (2세대)"}` → 201 (409 가 아니다)

### 3. 두 번째 제품

```sh
post $SCM/products '{"sku":"BAT-01","name":"배터리"}'
```

기대: `{"sku":"BAT-01","name":"배터리"}` → 201

### 4. 제품 목록 — sku 순, 갱신된 이름

```sh
get $SCM/products
```

기대: `[{"sku":"BAT-01","name":"배터리"},{"sku":"CAM-01","name":"카메라 (2세대)"}]` → 200
(이전 실행이 남긴 다른 SKU 가 더 있을 수 있다. 위 둘이 이 순서로 포함되면 된다.)

### 5. 이름 되돌리기

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라"}'
```

기대: `{"sku":"CAM-01","name":"카메라"}` → 201

### 6. 거점 등록 (3곳)

```sh
post $SCM/locations '{"code":"FAC-SZ","name":"선전 공장","type":"FACTORY","partner":"제조사 A"}'
post $SCM/locations '{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B"}'
post $SCM/locations '{"code":"SVC-SEL","name":"서울 서비스센터","type":"SERVICE_CENTER","partner":"AS 업체 C"}'
```

기대: 각각 보낸 본문 그대로 → 201

### 7. 거점 목록 — code 순

```sh
get $SCM/locations
```

기대 → 200:

```json
[
  { "code": "FAC-SZ", "name": "선전 공장", "type": "FACTORY", "partner": "제조사 A" },
  {
    "code": "SVC-SEL",
    "name": "서울 서비스센터",
    "type": "SERVICE_CENTER",
    "partner": "AS 업체 C"
  },
  { "code": "WH-ICN", "name": "인천 창고", "type": "WAREHOUSE", "partner": "3PL B" }
]
```

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

기대 → 200: 배열에 `{"sku":"CAM-01","locationCode":null,"status":"DELIVERED","quantity":N}` 이 있다 (N 은 이 DB 에 배송 완료된 CAM-01 수. 깨끗한 DB 면 1).
행은 sku, 거점, 상태별로 하나씩이고, 이전 실행의 제품도 집계된다.

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

기대 → 400: `{"code":"VALIDATION_FAILED","details":[{"path":"type","message":"Invalid option: expected one of \"MANUFACTURED\"|\"DISPATCHED\"|\"RECEIVED\"|\"STORED\"|\"SHIPPED\"|\"DELIVERED\"|\"RETURN_RECEIVED\"|\"DOA_CONFIRMED\"|\"SCRAPPED\""}]}`

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
재고에는 `{"sku":"CAM-01","locationCode":"SVC-SEL","status":"IN_STOCK","quantity":1}` 이 있고 WH-ICN 쪽 IN_STOCK 은 이 제품만큼 줄어 있다.

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
