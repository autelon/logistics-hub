# 제품 등록 플레이북

시리얼 목록을 제품으로 등록하고(제외 사유 포함), 기기 서버에 요청이 가서 시리얼별 결과가 돌아오고, 미등록 출고가 이상으로 표시되고,
DOA·등록 무효화가 비활성화 요청을 만드는 것까지 확인한다. 설계는 [../06-inbound-design.md](../06-inbound-design.md) 의 "제품 등록", 구현은 [../02-domain-model.md](../02-domain-model.md)·[../03-architecture.md](../03-architecture.md).

준비와 변수(`SCM`, `AS`, `RUN`, `post`, `get`, `DEV`)는 [README.md](README.md). **scm-api, as-api, device-api, MySQL, Redis** 가 모두 떠 있어야 하고 `REDIS_URL` 이 비어 있으면 안 된다
(기기 서버 알림이 아웃박스 → 메시지 버스 → 컨슈머로 가기 때문이다). 깨끗한 DB 에서 시작한다 (재고 수량을 비교한다).

- scm-api 는 `DEVICE_API_URL=http://localhost:<기기 서버 포트>` 로 띄운다.
- device-api 는 `PORT`, `HUB_URL=http://localhost:<scm 포트>`, `FAIL_SERIAL_SUFFIX=-FAIL` 로 띄운다 (끝이 `-FAIL` 인 시리얼을 실패로 보고한다). 로그는 `/tmp/device-api.log` 로 받는다.

  ```sh
  cd apps/device-api
  PORT=3004 HUB_URL=http://localhost:3001 FAIL_SERIAL_SUFFIX=-FAIL mise exec -- node dist/main.js > /tmp/device-api.log 2>&1 &
  ```

규격: `packages/contracts/src/scm.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`.
이 플레이북이 만드는 시리얼은 `REG-*-$RUN`. 등록 시각은 **등록하는 순간의 현재 시각**이라, 등록 뒤의 출고·배송은 그보다 나중 시각(`NOW`)으로 보고해야 "미등록 개체" 이상이 붙지 않는다.
상태 확인용으로 `jq` 를 쓴다.

## 기준 정보

### 1. 제품 — trackingMode 를 생략하면 SERIAL

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라"}'
post $SCM/products '{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"}'
get $SCM/products
post $SCM/products '{"sku":"X","name":"x","trackingMode":"BOGUS"}'
```

기대:

```
{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}                    → 201
{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"}                      → 201
[{"sku":"BAT-01","name":"배터리","trackingMode":"NONE"},{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}]   → 200
{"code":"VALIDATION_FAILED","details":[{"path":"trackingMode","message":"Invalid option: expected one of \"SERIAL\"|\"LOT\"|\"NONE\""}]}   → 400
```

(이전 실행이 남긴 SKU 가 목록에 더 있을 수 있다.)

### 2. 거점

```sh
post $SCM/locations '{"code":"FAC-SZ","name":"선전 공장","type":"FACTORY","partner":"제조사 A"}'
post $SCM/locations '{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B"}'
```

기대: 보낸 본문에 기본 `policy` 가 붙은 모양 ([scm-api.md](scm-api.md) 6 과 같다) → 201, 201

### 3. 개체를 만든다 — 입고된 6개, 실패용 1개, 비교용 3개

`receive <시리얼> <SKU>` 는 제조 → 출발 → 입고 세 사실을 보고한다 (출력은 상태 코드만).

```sh
ev() { curl -s -o /dev/null -w '%{http_code} ' -X POST $SCM/unit-events -H 'content-type: application/json' -d "$1"; }
receive() {  # receive <시리얼> <SKU>
  ev "{\"serialNumber\":\"$1\",\"sku\":\"$2\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
  ev "{\"serialNumber\":\"$1\",\"type\":\"DISPATCHED\",\"occurredAt\":\"2026-09-02T00:00:00Z\",\"source\":{\"system\":\"제조사 A\"}}"
  ev "{\"serialNumber\":\"$1\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-09-03T00:00:00Z\",\"locationCode\":\"WH-ICN\",\"source\":{\"system\":\"3PL B\"}}"
}
for s in A B C E F; do receive REG-$s-$RUN CAM-01; done
receive REG-D-$RUN-FAIL CAM-01          # 기기 서버가 실패로 보고할 시리얼
receive REG-BAT-$RUN BAT-01             # NONE 제품: 등록 대상이 아니다
receive REG-SHIP-$RUN CAM-01            # 입고 뒤 등록 없이 출고된다
ev "{\"serialNumber\":\"REG-SHIP-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"2026-09-04T00:00:00Z\",\"orderRef\":{\"orderId\":\"ORDER-$RUN\"},\"source\":{\"system\":\"3PL B\"}}"
ev "{\"serialNumber\":\"REG-MFG-$RUN\",\"sku\":\"CAM-01\",\"type\":\"MANUFACTURED\",\"occurredAt\":\"2026-09-01T00:00:00Z\",\"locationCode\":\"FAC-SZ\",\"source\":{\"system\":\"제조사 A\"}}"
echo
get $SCM/stock
```

기대: 상태 코드는 모두 `201` (3 × 8 + 2 = 26개). 재고 → 200 (깨끗한 DB 면 정확히 이 네 줄이고, `registered` 는 전부 `false`, `trackingMode` 는 개체로 센 행이라 전부 `SERIAL`, `lotNo`·`stockStatus` 는 `null`):

```json
[
  {
    "sku": "BAT-01",
    "trackingMode": "SERIAL",
    "locationCode": "WH-ICN",
    "status": "IN_STOCK",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 1
  },
  {
    "sku": "CAM-01",
    "trackingMode": "SERIAL",
    "locationCode": null,
    "status": "SHIPPED",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 1
  },
  {
    "sku": "CAM-01",
    "trackingMode": "SERIAL",
    "locationCode": "FAC-SZ",
    "status": "PRODUCED",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 1
  },
  {
    "sku": "CAM-01",
    "trackingMode": "SERIAL",
    "locationCode": "WH-ICN",
    "status": "IN_STOCK",
    "registered": false,
    "lotNo": null,
    "stockStatus": null,
    "quantity": 6
  }
]
```

### 4. 등록 없이 출고된 개체는 이상으로 표시된다 (거부하지도, 자동 등록하지도 않는다)

```sh
curl -s $SCM/units/REG-SHIP-$RUN | jq -c '{status,registeredAt,anomalies}'
```

기대: `{"status":"SHIPPED","registeredAt":null,"anomalies":["2026-09-04T00:00:00.000Z SHIPPED: 미등록 개체"]}`

## 제품 등록

### 5. 한 개를 등록한다 → 기기 요청이 만들어지고 처리되어 COMPLETED

```sh
post $SCM/unit-registrations "{\"serialNumbers\":[\"REG-E-$RUN\"],\"actor\":\"operator-1\"}"
sleep 3
R5=$(curl -s $SCM/device-requests | jq -r '.[0].id'); echo R5=$R5
get $SCM/device-requests/$R5
get $DEV/device-requests
curl -s $SCM/units/REG-E-$RUN | jq -c '{status,locationCode,registeredAt,anomalies}'
curl -s $SCM/stock | jq -c '.[] | select(.sku=="CAM-01" and .locationCode=="WH-ICN")'
```

기대:

- 등록 응답 `{"requestId":"<R5>","registered":["REG-E-<RUN>"],"excluded":[]}` → 201
- 요청 조회 → 200: `{"id":"<R5>","type":"REGISTER","reason":"REGISTRATION","createdBy":"operator-1","createdAt":"<시각>","notifiedAt":"<시각>","status":"COMPLETED","counts":{"total":1,"pending":0,"succeeded":1,"failed":0},"failedItems":[]}`
- 기기 서버 → 200: `[{"requestId":"<R5>","type":"REGISTER","count":1,"state":"DONE","processed":1,"succeeded":1,"failed":0}]`
- 개체: `{"status":"IN_STOCK","locationCode":"WH-ICN","registeredAt":"<시각>","anomalies":[]}` — 물리 상태는 그대로이고 등록 시각만 채워진다.
- 재고의 인천 창고 `IN_STOCK` 은 `registered` `false` 5개와 `true` 1개로 나뉜다.
- `/tmp/device-api.log` 에 `Received REGISTER request <R5> (1 units)`, `register REG-E-<RUN> (CAM-01) -> SUCCEEDED [<R5>]`, `Finished request <R5>: 1 succeeded, 0 failed`.

### 6. 여러 개를 한 번에 — 등록되는 것과 제외 사유 네 가지, 목록의 중복

```sh
post $SCM/unit-registrations "{\"serialNumbers\":[\"REG-A-$RUN\",\"REG-B-$RUN\",\"REG-C-$RUN\",\"REG-D-$RUN-FAIL\",\"REG-E-$RUN\",\"REG-SHIP-$RUN\",\"REG-MFG-$RUN\",\"REG-BAT-$RUN\",\"GHOST-$RUN\",\"REG-A-$RUN\"],\"actor\":\"operator-1\"}"
sleep 3
R6=$(curl -s $SCM/device-requests | jq -r '.[0].id'); echo R6=$R6
```

기대 → 201 (제외 목록은 입력 순서, 같은 시리얼이 두 번 있어도 한 번만 본다):

```json
{
  "requestId": "<R6>",
  "registered": ["REG-A-<RUN>", "REG-B-<RUN>", "REG-C-<RUN>", "REG-D-<RUN>-FAIL"],
  "excluded": [
    { "serialNumber": "REG-E-<RUN>", "reason": "ALREADY_REGISTERED" },
    { "serialNumber": "REG-SHIP-<RUN>", "reason": "NOT_IN_STOCK" },
    { "serialNumber": "REG-MFG-<RUN>", "reason": "NOT_IN_STOCK" },
    { "serialNumber": "REG-BAT-<RUN>", "reason": "NOT_SERIAL_TRACKED" },
    { "serialNumber": "GHOST-<RUN>", "reason": "UNIT_NOT_FOUND" }
  ]
}
```

기기 요청은 **하나**(등록된 네 개가 항목)다. 제외된 것은 요청에 없다.

### 7. 요청 상태 — 일부 실패는 PARTIALLY_FAILED, 실패 항목과 사유가 보인다

```sh
get $SCM/device-requests/$R6
get $DEV/device-requests
curl -s $SCM/stock | jq -c '.[] | select(.sku=="CAM-01" and .locationCode=="WH-ICN")'
```

기대:

- 요청 조회 → 200: `"type":"REGISTER"`, `"status":"PARTIALLY_FAILED"`, `"counts":{"total":4,"pending":0,"succeeded":3,"failed":1}`,
  `"failedItems":[{"serialNumber":"REG-D-<RUN>-FAIL","sku":"CAM-01","reason":"simulated failure (serial ends with -FAIL)","resultAt":"<시각>"}]`
- 기기 서버: 요청 둘, 뒤의 것이 `"count":4,"state":"DONE","processed":4,"succeeded":3,"failed":1`.
- 재고: 인천 창고 `IN_STOCK` 은 `registered` `false` 1개(REG-F), `true` 5개. 기기 서버가 실패로 보고해도 **우리 쪽 등록은 유지된다** (실패는 기기 요청의 결과일 뿐이다).
- `/tmp/device-api.log` 에 시리얼마다 한 줄 — `register REG-D-<RUN>-FAIL (CAM-01) -> FAILED [<R6>]` 포함.

### 8. 시리얼 목록 당김 — 항목 id 순서의 커서로 페이지씩

```sh
get "$SCM/device-requests/$R6/units?limit=3"
C=$(curl -s "$SCM/device-requests/$R6/units?limit=3" | jq -r .nextCursor)
get "$SCM/device-requests/$R6/units?limit=3&cursor=$C"
```

기대 → 200 둘:

- 첫 페이지: `{"items":[{"serialNumber":"REG-A-<RUN>","sku":"CAM-01"},{"serialNumber":"REG-B-<RUN>",…},{"serialNumber":"REG-C-<RUN>",…}],"nextCursor":"<마지막 항목 id>"}`
- 둘째 페이지: `{"items":[{"serialNumber":"REG-D-<RUN>-FAIL","sku":"CAM-01"}],"nextCursor":null}` (같은 커서로 다시 부르면 같은 페이지다.)

### 9. 결과 보고 — 같은 시리얼은 마지막 값이 이긴다, 모르는 시리얼은 통째로 거절

```sh
post $SCM/device-requests/$R6/results "{\"items\":[{\"serialNumber\":\"REG-D-$RUN-FAIL\",\"result\":\"SUCCEEDED\"}]}"
get $SCM/device-requests/$R6
post $SCM/device-requests/$R6/results "{\"items\":[{\"serialNumber\":\"REG-C-$RUN\",\"result\":\"FAILED\",\"reason\":\"기기 데이터 생성 실패\"},{\"serialNumber\":\"GHOST-$RUN\",\"result\":\"SUCCEEDED\"}]}"
curl -s $SCM/device-requests/$R6 | jq -c '{status,counts}'
post $SCM/device-requests/00000000-0000-0000-0000-000000000000/results '{"items":[{"serialNumber":"A","result":"SUCCEEDED"}]}'
get $SCM/device-requests/00000000-0000-0000-0000-000000000000/units
post $SCM/device-requests/$R6/results '{"items":[]}'
get "$SCM/device-requests/$R6/units?limit=1001"
```

기대:

- 첫 보고 → 204 (본문 없음). 조회 → 200: `"status":"COMPLETED"`, `"counts":{"total":4,"pending":0,"succeeded":4,"failed":0}`, `"failedItems":[]` (실패였던 것이 성공으로 덮어써졌다).
- 모르는 시리얼이 섞인 보고 → 422 `{"code":"DEVICE_REQUEST_UNKNOWN_SERIAL","message":"1 serial(s) do not belong to device request <R6>","details":{"serialNumbers":["GHOST-<RUN>"]}}`.
  통째로 거절되어 REG-C 의 FAILED 도 기록되지 않았다: `{"status":"COMPLETED","counts":{"total":4,"pending":0,"succeeded":4,"failed":0}}`.
- 없는 요청 → 404 `{"code":"DEVICE_REQUEST_NOT_FOUND","message":"Device request 00000000-0000-0000-0000-000000000000 not found"}` (결과 보고와 시리얼 조회 둘 다).
- 빈 보고 → 400 `{"code":"VALIDATION_FAILED","details":[{"path":"items","message":"Too small: expected array to have >=1 items"}]}`.
- `limit=1001` → 400 `{"code":"VALIDATION_FAILED","details":[{"path":"limit","message":"Too big: expected number to be <=1000"}]}`.

### 10. 등록 명령의 입력 검증

```sh
post $SCM/unit-registrations '{"serialNumbers":[],"actor":"op"}'
post $SCM/unit-registrations '{"serialNumbers":["a"]}'
jq -n '{serialNumbers:[range(0;5001)|"X-\(.)"],actor:"op"}' | curl -s -w '\n→ %{http_code}\n' -X POST $SCM/unit-registrations -H 'content-type: application/json' -d @-
```

기대: 모두 400 `VALIDATION_FAILED`, `details` 는 각각
`[{"path":"serialNumbers","message":"Too small: expected array to have >=1 items"}]`,
`[{"path":"actor","message":"Invalid input: expected string, received undefined"}]`,
`[{"path":"serialNumbers","message":"Too big: expected array to have <=5000 items"}]`.

## 기기 서버와의 연동

### 11. 같은 알림이 두 번 와도 한 번만 처리한다 — 처리하다 멈춘 요청만 다시 처리한다

```sh
post $DEV/device-requests "{\"requestId\":\"$R6\",\"type\":\"REGISTER\",\"count\":4}"
post $DEV/device-requests '{"requestId":"no-such-request","type":"REGISTER","count":1}'
sleep 1
curl -s $DEV/device-requests | jq -c '.[] | select(.requestId=="no-such-request")'
post $DEV/device-requests '{"requestId":"no-such-request","type":"REGISTER","count":1}'
post $DEV/device-requests '{"requestId":"","type":"NOPE","count":-1}'
```

기대:

- 이미 처리한 `<R6>` → 202 `{"requestId":"<R6>","outcome":"duplicate"}` (다시 가져가지도, 결과를 덮어쓰지도 않는다. 9 의 결과가 그대로다).
- 허브가 모르는 요청 → 202 `{"requestId":"no-such-request","outcome":"accepted"}`. 시리얼을 가져오려다 404 를 받아 멈춘다:
  `{"requestId":"no-such-request","type":"REGISTER","count":1,"state":"ERROR","processed":0,"succeeded":0,"failed":0}`, 로그에 `Request no-such-request stopped after 0 units: Error: Hub answered 404 …`.
- 멈춘(`ERROR`) 요청에 같은 알림이 다시 오면 → 202 `"outcome":"accepted"` (중복이 아니라 다시 처리).
- 형식이 틀린 알림 → 400 `{"code":"VALIDATION_FAILED","details":[{"path":"requestId",…},{"path":"type",…},{"path":"count",…}]}`.

### 12. 기기 서버가 내려가 있으면 알림이 재시도된다 (REGISTER 요청은 만들어지고 NOT_NOTIFIED 로 남는다)

```sh
kill $(lsof -ti:3004)          # 기기 서버를 내린다 (서브에이전트는 자기 포트)
post $SCM/unit-registrations "{\"serialNumbers\":[\"REG-F-$RUN\"],\"actor\":\"operator-3\"}"
sleep 2
curl -s $SCM/device-requests | jq -c '.[0]'
```

기대: 등록은 성공(201, 등록 사실은 이미 커밋됨). 요청은 `"notifiedAt":null,"status":"NOT_NOTIFIED","counts":{"total":1,"pending":1,"succeeded":0,"failed":0}`.
scm-api 로그에 `[messaging] handler scm.device-requests/scm-api message … TypeError: fetch failed` (확인 처리되지 않아 남는다).

기기 서버를 다시 띄우고(준비의 같은 명령) 실패한 메시지가 재시도되길 기다린다 (재시도는 10초 뒤).

```sh
sleep 15
curl -s $SCM/device-requests | jq -c '.[0]'
curl -s $DEV/device-requests | jq -c '.[0]'
```

기대: 요청이 `"status":"COMPLETED"`, `notifiedAt` 가 채워져 있고 `succeeded` 1. 기기 서버는 재시작했으므로 이 요청 하나만 `"state":"DONE"` 으로 보인다.

## 비활성화와 재등록

### 13. 등록된 개체가 DOA 로 확정되면 DEACTIVATE 요청이 만들어진다

REG-A 는 6 에서 등록되었다. 등록 뒤의 시각으로 출고·배송을 보고하면 이상이 붙지 않는다.

```sh
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
post $SCM/unit-events "{\"serialNumber\":\"REG-A-$RUN\",\"type\":\"SHIPPED\",\"occurredAt\":\"$NOW\",\"orderRef\":{\"orderId\":\"ORDER-$RUN\"},\"source\":{\"system\":\"3PL B\"}}"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
post $SCM/unit-events "{\"serialNumber\":\"REG-A-$RUN\",\"type\":\"DELIVERED\",\"occurredAt\":\"$NOW\",\"source\":{\"system\":\"택배사 D\"}}"
curl -s $SCM/units/REG-A-$RUN | jq -c '{status,registeredAt,anomalies}'
post $AS/cases "{\"serialNumber\":\"REG-A-$RUN\",\"origin\":\"SALES\",\"symptom\":\"전원이 켜지지 않음\"}"
CASE=$(curl -s $AS/cases | jq -r '.[0].id')
post $AS/cases/$CASE/confirm-doa '{"disposition":"SCRAP"}'
sleep 3
curl -s $SCM/device-requests | jq -c '.[0]'
curl -s $SCM/units/REG-A-$RUN | jq -c '{status,registeredAt,anomalies}'
curl -s $SCM/stock | jq -c '.[] | select(.status=="DOA")'
```

기대:

- 출고·배송 보고 → 201 둘. 배송 뒤 개체 `{"status":"DELIVERED","registeredAt":"<6 의 등록 시각>","anomalies":[]}` — 등록된 개체의 출고에는 "미등록 개체" 이상이 없다.
- 접수 201, 확정 200 (as-api 응답은 [as-api.md](as-api.md)).
- 가장 최근 요청: `{"id":"…","type":"DEACTIVATE","reason":"DOA_CONFIRMED","createdBy":"as-api","createdAt":"<시각>","notifiedAt":"<시각>","status":"COMPLETED","counts":{"total":1,"pending":0,"succeeded":1,"failed":0}}`.
  `/tmp/device-api.log` 에 `Received DEACTIVATE request …`, `deactivate REG-A-<RUN> (CAM-01) -> SUCCEEDED [...]`.
- 개체는 `{"status":"DOA","registeredAt":"<그대로>","anomalies":[]}` — DOA 가 되어도 등록 사실은 남는다. 재고 `{"sku":"CAM-01","trackingMode":"SERIAL","locationCode":null,"status":"DOA","registered":true,"lotNo":null,"stockStatus":null,"quantity":1}`.

### 14. DOA 사실을 정정(무효화)해 다시 정상이 되면 REGISTER 요청이 다시 만들어진다

```sh
DOA=$(curl -s $SCM/units/REG-A-$RUN | jq -r '.events[] | select(.type=="DOA_CONFIRMED") | .id')
post $SCM/unit-events/$DOA/corrections '{"reason":"AS 오판정","actor":"operator-2"}'
sleep 3
curl -s $SCM/device-requests | jq -c '.[0]'
curl -s $SCM/units/REG-A-$RUN | jq -c '{status,registeredAt,anomalies}'
```

기대: 정정 → 201 `{"correctionId":"<uuid>","replacementEventId":null}`. 가장 최근 요청은
`"type":"REGISTER","reason":"DOA_CONFIRMED_VOIDED","createdBy":"operator-2"`, `"status":"COMPLETED"`. 개체는 `{"status":"DELIVERED","registeredAt":"<그대로>","anomalies":[]}`.

### 15. 등록 사실을 정정하면 registeredAt 이 비워지고 DEACTIVATE 요청이 생긴다 — 다시 등록할 수 있다

```sh
REGEV=$(curl -s $SCM/units/REG-B-$RUN | jq -r '.events[] | select(.type=="REGISTERED") | .id')
post $SCM/unit-events/$REGEV/corrections '{"reason":"잘못 등록함","actor":"operator-2"}'
sleep 3
curl -s $SCM/device-requests | jq -c '.[0]'
curl -s $SCM/units/REG-B-$RUN | jq -c '{status,registeredAt,anomalies}'
curl -s $SCM/stock | jq -c '.[] | select(.sku=="CAM-01" and .locationCode=="WH-ICN")'
post $SCM/unit-registrations "{\"serialNumbers\":[\"REG-B-$RUN\"],\"actor\":\"operator-2\"}"
sleep 3
curl -s $SCM/device-requests | jq -c '.[0]'
```

기대:

- 정정 → 201. 가장 최근 요청 `"type":"DEACTIVATE","reason":"REGISTRATION_VOIDED","createdBy":"operator-2"`, `COMPLETED`.
- 개체 `{"status":"IN_STOCK","registeredAt":null,"anomalies":[]}`. 재고의 인천 창고 `IN_STOCK` 은 `registered` `false` 1개(REG-B), `true` 4개(REG-C, REG-D…-FAIL, REG-E, REG-F). REG-A 는 배송되어 이 행에 없다.
- 다시 등록 → 201 `{"requestId":"<새 id>","registered":["REG-B-<RUN>"],"excluded":[]}`, 최근 요청은 `"type":"REGISTER","reason":"REGISTRATION"`, `COMPLETED`.

## 한도

### 16. 한 번에 5000개 — 본문이 100KB 를 넘는 크기

개체 5000개를 SQL 로 만든다 (제조·출발·입고 사실 포함. 테스트용이라 `UUID()` 를 쓴다).

```sh
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "
SET SESSION cte_max_recursion_depth=6000;
INSERT INTO units (id, serial_number, product_id, status, location_id, anomalies, created_at, updated_at)
SELECT UUID(), CONCAT('BULK-$RUN-', n), (SELECT id FROM products WHERE sku='CAM-01'), 'IN_STOCK', (SELECT id FROM locations WHERE code='WH-ICN'), JSON_ARRAY(), NOW(3), NOW(3)
FROM (WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<5000) SELECT n FROM seq) t;
INSERT INTO unit_events (id, unit_id, type, occurred_at, recorded_at, location_id, source_system)
SELECT UUID(), u.id, e.type, e.at, NOW(3), IF(e.type='DISPATCHED', NULL, u.location_id), 'bulk-sql'
FROM units u JOIN (SELECT 'MANUFACTURED' AS type, '2026-09-01 00:00:00.000' AS at UNION ALL SELECT 'DISPATCHED', '2026-09-02 00:00:00.000' UNION ALL SELECT 'RECEIVED', '2026-09-03 00:00:00.000') e
WHERE u.serial_number LIKE 'BULK-$RUN-%';
SELECT COUNT(*) AS units FROM units WHERE serial_number LIKE 'BULK-$RUN-%'"
jq -n --arg run $RUN '{serialNumbers:[range(1;5001)|"BULK-\($run)-\(.)"],actor:"operator-bulk"}' > /tmp/bulk-$RUN.json
wc -c < /tmp/bulk-$RUN.json
time curl -s -X POST $SCM/unit-registrations -H 'content-type: application/json' -d @/tmp/bulk-$RUN.json | jq -c '{requestId, registered: (.registered|length), excluded: (.excluded|length)}'
sleep 8
curl -s $SCM/device-requests | jq -c '.[0] | {type,status,counts}'
curl -s $DEV/device-requests | jq -c '.[] | select(.count==5000)'
```

기대: `units` 5000. 본문 크기는 `RUN` 길이에 따라 다르다 (관찰: `RUN=reg2` 일 때 108949바이트로 기본 한도 100KB 를 넘는다. scm-api 는 한도를 1MB 로 올려 두었다).
등록 응답 `{"requestId":"<id>","registered":5000,"excluded":0}` 은 몇 초 안(관찰: 2.4초)에 돌아온다.
요청은 `{"type":"REGISTER","status":"COMPLETED","counts":{"total":5000,"pending":0,"succeeded":5000,"failed":0}}`,
기기 서버는 `"count":5000,"state":"DONE","processed":5000,"succeeded":5000,"failed":0` — 500개씩 열 페이지를 당겨 갔고 빠진 시리얼이 없다.

### 17. 아웃박스와 요청 테이블

```sh
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT type, reason, created_by, notified_at IS NOT NULL AS notified FROM device_requests ORDER BY id"
docker-compose exec -T mysql mysql -uroot -proot lh_scm -e "SELECT COUNT(*) AS requests, SUM(published_at IS NULL) AS unpublished FROM outbox_events WHERE topic='scm.device-requests'"
```

(서브에이전트는 `lh_scm` 대신 자기 DB.) 기대 (깨끗한 DB 에서 처음부터 돌렸을 때):

```
type        reason                 created_by      notified
REGISTER    REGISTRATION           operator-1      1        ← 5
REGISTER    REGISTRATION           operator-1      1        ← 6
REGISTER    REGISTRATION           operator-3      1        ← 12
DEACTIVATE  DOA_CONFIRMED          as-api          1        ← 13
REGISTER    DOA_CONFIRMED_VOIDED   operator-2      1        ← 14
DEACTIVATE  REGISTRATION_VOIDED    operator-2      1        ← 15
REGISTER    REGISTRATION           operator-2      1        ← 15 (재등록)
REGISTER    REGISTRATION           operator-bulk   1        ← 16

requests  unpublished
8         0
```

아웃박스의 `scm.device-requests` 행 수는 요청 수와 같고 모두 발행되었다 (`unpublished` 0).

## 웹 콘솔

`제품 등록` 화면(시리얼 입력 → 등록 결과와 제외 사유, 기기 요청 목록)과 재고의 `등록` 열은 [web-console.md](web-console.md) 6–7.
