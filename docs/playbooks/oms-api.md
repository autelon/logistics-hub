# oms-api 플레이북

준비와 변수(`OMS`, `SCM`, `AS`, `RUN`, `post`, `get`)는 [README.md](README.md). 이벤트 수신(12–19)에는 scm-api, as-api, Redis 가 떠 있어야 하고
scm-api 에 제품 `CAM-01`·`BAT-01` 과 거점 `FAC-SZ`·`WH-ICN` 이 등록되어 있어야 한다 ([scm-api.md](scm-api.md) 1–6).
규격: `packages/contracts/src/oms.ts`. 에러 코드와 상태: `apps/oms-api/src/errors.ts`.

## 판매 상품

### 1. 구성품 1종 1개는 SINGLE

```sh
post $OMS/sellables '{"code":"CAM-SINGLE","name":"카메라 단품","components":[{"sku":"CAM-01","quantity":1}]}'
```

기대: `{"code":"CAM-SINGLE","name":"카메라 단품","kind":"SINGLE","components":[{"sku":"CAM-01","quantity":1}]}` → 201

### 2. 패키지 — 같은 SKU 가 여러 번 오면 수량을 합친다

```sh
post $OMS/sellables '{"code":"KIT-01","name":"카메라 스타터 키트","components":[{"sku":"CAM-01","quantity":1},{"sku":"BAT-01","quantity":1},{"sku":"BAT-01","quantity":1}]}'
```

기대: `{"code":"KIT-01","name":"카메라 스타터 키트","kind":"PACKAGE","components":[{"sku":"CAM-01","quantity":1},{"sku":"BAT-01","quantity":2}]}` → 201

### 3. 같은 코드로 다시 보내면 구성이 통째로 바뀐다

```sh
post $OMS/sellables '{"code":"KIT-01","name":"카메라 스타터 키트","components":[{"sku":"CAM-01","quantity":1},{"sku":"BAT-01","quantity":1}]}'
```

기대: `{"code":"KIT-01","name":"카메라 스타터 키트","kind":"PACKAGE","components":[{"sku":"CAM-01","quantity":1},{"sku":"BAT-01","quantity":1}]}` → 201

### 4. 구성품 1종이라도 수량이 2면 PACKAGE

```sh
post $OMS/sellables '{"code":"BAT-2PK","name":"배터리 2개입","components":[{"sku":"BAT-01","quantity":2}]}'
```

기대: `{"code":"BAT-2PK","name":"배터리 2개입","kind":"PACKAGE","components":[{"sku":"BAT-01","quantity":2}]}` → 201

### 5. 목록 — code 순. 구성품은 저장 순서가 아니라 sku 순으로 나온다

```sh
get $OMS/sellables
```

기대 → 200:

```json
[
  {
    "code": "BAT-2PK",
    "name": "배터리 2개입",
    "kind": "PACKAGE",
    "components": [{ "sku": "BAT-01", "quantity": 2 }]
  },
  {
    "code": "CAM-SINGLE",
    "name": "카메라 단품",
    "kind": "SINGLE",
    "components": [{ "sku": "CAM-01", "quantity": 1 }]
  },
  {
    "code": "KIT-01",
    "name": "카메라 스타터 키트",
    "kind": "PACKAGE",
    "components": [
      { "sku": "BAT-01", "quantity": 1 },
      { "sku": "CAM-01", "quantity": 1 }
    ]
  }
]
```

(KIT-01 의 구성품 순서가 3 의 응답(CAM-01, BAT-01)과 다르다. 현재 동작이며 규격은 순서를 약속하지 않는다.)

### 6. 검증 실패 — 구성품 없음

```sh
post $OMS/sellables '{"code":"X","name":"x","components":[]}'
```

기대: `{"code":"VALIDATION_FAILED","details":[{"path":"components","message":"Too small: expected array to have >=1 items"}]}` → 400

## 주문 수신

### 7. 주문 한 건 — 줄 둘, 패키지가 물리 출고 항목 4개로 풀린다

```sh
post $OMS/orders "{\"channel\":\"naver-smartstore\",\"channelOrderNo\":\"N-$RUN\",\"orderedAt\":\"2026-09-10T09:00:00+09:00\",\"lines\":[{\"sellableCode\":\"KIT-01\",\"quantity\":1},{\"sellableCode\":\"BAT-2PK\",\"quantity\":1}]}"
```

기대: `{"orderId":"<uuid>","duplicate":false}` → 201. `orderId` 를 `ORDER` 에 담는다.

### 8. 같은 채널 주문번호는 다시 받지 않는다 — 같은 orderId

```sh
post $OMS/orders "{\"channel\":\"naver-smartstore\",\"channelOrderNo\":\"N-$RUN\",\"orderedAt\":\"2026-09-10T09:00:00+09:00\",\"lines\":[{\"sellableCode\":\"KIT-01\",\"quantity\":1}]}"
```

기대: `{"orderId":"<ORDER 와 같은 값>","duplicate":true}` → 201 (본문이 달라도 처음 주문이 유지된다)

### 9. 조회 — publicId, 줄과 항목

```sh
get $OMS/orders/$ORDER
```

기대 → 200:

```json
{
  "id": "<ORDER>",
  "publicId": "ORD-2026-<6자리>",
  "channel": "naver-smartstore",
  "channelOrderNo": "N-<RUN>",
  "orderedAt": "2026-09-10T00:00:00.000Z",
  "status": "OPEN",
  "lines": [
    {
      "id": "<uuid>", "lineNo": 1, "sellableCode": "KIT-01", "sellableName": "카메라 스타터 키트", "sellableKind": "PACKAGE", "quantity": 1,
      "items": [
        { "id": "<uuid>", "sku": "BAT-01", "status": "PENDING", "reason": "ORDER", "replacesItemId": null, "serialNumber": null, "shippedAt": null, "deliveredAt": null, "doaCaseId": null },
        { "id": "<uuid>", "sku": "CAM-01", "status": "PENDING", "reason": "ORDER", "replacesItemId": null, "serialNumber": null, "shippedAt": null, "deliveredAt": null, "doaCaseId": null }
      ]
    },
    {
      "id": "<uuid>", "lineNo": 2, "sellableCode": "BAT-2PK", "sellableName": "배터리 2개입", "sellableKind": "PACKAGE", "quantity": 1,
      "items": [
        { "id": "<uuid>", "sku": "BAT-01", "status": "PENDING", "reason": "ORDER", … },
        { "id": "<uuid>", "sku": "BAT-01", "status": "PENDING", "reason": "ORDER", … }
      ]
    }
  ]
}
```

- `orderedAt` 은 `+09:00` 으로 보냈어도 UTC(`Z`)로 돌아온다.
- `publicId` 는 `ORD-<UTC 연도>-<6자리 일련번호>`. 깨끗한 DB 면 `ORD-2026-000001`, 아니면 그 DB 에서 다음 번호.
- 항목은 줄 안에서 sku 순으로 보이는 것이 현재 동작이다 (규격은 순서를 약속하지 않는다).

### 10. 에러 코드 — UNKNOWN_SELLABLE, ORDER_NOT_FOUND, VALIDATION_FAILED

```sh
post $OMS/orders "{\"channel\":\"naver-smartstore\",\"channelOrderNo\":\"N-$RUN-X\",\"orderedAt\":\"2026-09-10T00:00:00Z\",\"lines\":[{\"sellableCode\":\"NOPE\",\"quantity\":1},{\"sellableCode\":\"KIT-01\",\"quantity\":1}]}"
get $OMS/orders/00000000-0000-0000-0000-000000000000
post $OMS/orders '{"channel":"x","channelOrderNo":"y","orderedAt":"not-a-date","lines":[]}'
```

기대:

- `{"code":"UNKNOWN_SELLABLE","message":"Unknown sellable: NOPE","details":{"codes":["NOPE"]}}` → 422 (주문은 저장되지 않는다. `N-$RUN-X` 로 다시 보내면 `duplicate:false` 가 아니라 다시 422)
- `{"code":"ORDER_NOT_FOUND","message":"Order 00000000-0000-0000-0000-000000000000 not found"}` → 404
- `{"code":"VALIDATION_FAILED","details":[{"path":"orderedAt","message":"Invalid ISO datetime"},{"path":"lines","message":"Too small: expected array to have >=1 items"}]}` → 400

### 11. 목록과 아웃박스

```sh
get $OMS/orders
docker-compose exec -T mysql mysql -uroot -proot lh_oms -e "SELECT topic, JSON_EXTRACT(payload,'$.type') AS type, JSON_LENGTH(payload,'$.payload.items') AS items, published_at IS NOT NULL AS published FROM outbox_events WHERE \`key\`='$ORDER' ORDER BY id"
```

기대: 목록 → 200, 최근 50건, **최신이 앞**이라 `N-$RUN` 이 첫 원소이고 9 와 같은 모양.
아웃박스: `oms.order-events` | `"oms.fulfillment.requested"` | items 4 | published 1 (수신 직후 0.5초 안에 보면 0 일 수 있다).

## SCM 이벤트 수신 (scm-api + Redis 필요)

### 12. 재고가 있는 제품을 이 주문으로 출고 보고 → 같은 SKU 의 PENDING 항목에 시리얼이 붙는다

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-C-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-C-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-C-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-C-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-11T00:00:00Z\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"3PL B\"}}"
# 마지막 eventId 를 SHIP 에 담는다. 잠시 뒤
get $OMS/orders/$ORDER
```

기대: 1번 줄의 CAM-01 항목이 `{"sku":"CAM-01","status":"SHIPPED","serialNumber":"CAM-C-<RUN>","shippedAt":"2026-09-11T00:00:00.000Z",…}`. 나머지 셋(BAT-01)은 그대로 PENDING. `status` 는 `OPEN`.

### 13. 배송 완료 (주문 참조 없이 보고해도 출고 때의 주문으로 이어진다)

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-C-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"2026-09-12T00:00:00Z\",\"source\":{\"system\":\"택배사 D\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
```

기대: 그 항목이 `"status":"DELIVERED","deliveredAt":"2026-09-12T00:00:00.000Z"`.

### 14. 출고 보고가 무효화되면 항목은 시리얼을 떼고 PENDING 으로 돌아간다

```sh
post $SCM/unit-events/$SHIP/corrections '{"reason":"오출고 보고","actor":"operator-1"}'
# 잠시 뒤
get $OMS/orders/$ORDER
get $SCM/units/CAM-C-$RUN
```

기대: OMS 항목이 `"status":"PENDING","serialNumber":null,"shippedAt":null,"deliveredAt":null`.
SCM 쪽 제품은 `status` `DELIVERED`, `anomalies` `["2026-09-12T00:00:00.000Z DELIVERED: IN_STOCK 상태에서 올 수 없는 사실"]` (배송 완료 사실은 여전히 유효하다. 바로잡으려면 그것도 정정해야 한다).

### 15. 다른 제품으로 제대로 출고·배송

```sh
post $SCM/unit-events "{\"serialNumber\":\"CAM-D-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-D-$RUN\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-D-$RUN\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-D-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-13T00:00:00Z\",\"orderRef\":{\"orderId\":\"$ORDER\"},\"source\":{\"system\":\"3PL B\"}}"
post $SCM/unit-events "{\"serialNumber\":\"CAM-D-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"2026-09-14T00:00:00Z\",\"source\":{\"system\":\"택배사 D\"}}"
# 잠시 뒤
get $OMS/orders/$ORDER
```

기대: CAM-01 항목이 `"status":"DELIVERED","serialNumber":"CAM-D-<RUN>"`. BAT-01 셋은 PENDING 이라 `status` 는 여전히 `OPEN`.

### 16. 주문에 없는 SKU·주문의 출고 보고는 무시하고 error 로그만 남긴다

[scm-api.md](scm-api.md) 12 처럼 존재하지 않는 `orderId` 로 SHIPPED 를 보고하면 oms-api 로그에
`ERROR [OrderService] Shipment of CAM-A-<RUN> (CAM-01) matches no pending item of order ORDER-<RUN>` 한 줄이 남고, 주문 데이터는 바뀌지 않는다. 재시도하지 않는다.

## AS 이벤트 수신 (as-api + Redis 필요)

### 17. DOA 확정 → 항목 DOA + 교체 출고 항목 + fulfillment.requested

```sh
post $AS/cases "{\"serialNumber\":\"CAM-D-$RUN\",\"origin\":\"SALES\",\"symptom\":\"화면 불량\"}"
# 응답 id 를 CASE 에 담는다
post $AS/cases/$CASE/confirm-doa '{"disposition":"RETURN_TO_VENDOR"}'
# 잠시 뒤
get $OMS/orders/$ORDER
docker-compose exec -T mysql mysql -uroot -proot lh_oms -e "SELECT JSON_EXTRACT(payload,'$.type') AS type, JSON_EXTRACT(payload,'$.payload.items[*].reason') AS reasons, published_at IS NOT NULL AS published FROM outbox_events WHERE \`key\`='$ORDER' ORDER BY id"
```

기대: 1번 줄의 항목이 셋이 된다 —
`{"sku":"CAM-01","status":"DOA","serialNumber":"CAM-D-<RUN>","reason":"ORDER","doaCaseId":"<CASE>",…}` 와
`{"sku":"CAM-01","status":"PENDING","reason":"DOA_REPLACEMENT","replacesItemId":"<DOA 항목의 id>","serialNumber":null,…}` 가 추가. `status` 는 `OPEN` (DOA 항목은 집계에서 빠진다).
아웃박스 2행: `"oms.fulfillment.requested"` reasons `["ORDER","ORDER","ORDER","ORDER"]`, 그다음 `"oms.fulfillment.requested"` reasons `["DOA_REPLACEMENT"]`, 둘 다 published 1.

### 18. 같은 메시지가 다시 와도 교체 항목이 또 생기지 않는다 (processed_messages)

```sh
VALUE=$(docker-compose exec -T redis redis-cli --raw XREVRANGE as.case-events + - COUNT 1 | sed -n 5p)
docker-compose exec -T redis redis-cli XADD as.case-events '*' key CAM-D-$RUN value "$VALUE"
# 잠시 뒤
get $OMS/orders/$ORDER
docker-compose exec -T mysql mysql -uroot -proot lh_oms -e "SELECT consumer_group, COUNT(*) AS n FROM processed_messages GROUP BY consumer_group"
```

기대: 주문이 17 과 같다 (DOA_REPLACEMENT 항목 하나). `processed_messages` 는 `oms-api` 그룹 한 줄이고 n 은 재전송 전과 같다 (`claim` 이 false 를 돌려주면 기록도 늘지 않는다).

### 19. 주문으로 나간 적 없는 시리얼의 DOA 는 주문과 무관하다

```sh
post $AS/cases "{\"serialNumber\":\"CAM-B-$RUN\",\"origin\":\"SALES\",\"symptom\":\"x\"}"
post $AS/cases/<응답 id>/confirm-doa '{"disposition":"SCRAP"}'
# 잠시 뒤
get $OMS/orders
```

기대: 어느 주문도 바뀌지 않고 로그도 없다. (`CAM-B-$RUN` 은 [scm-api.md](scm-api.md) 23 의 제품으로, 출고 보고가 무효화되어 어떤 항목에도 붙어 있지 않다.)
