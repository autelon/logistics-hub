# 수량 원장 플레이북

시리얼 없는(`LOT`·`NONE`) 제품의 수량 원장(`stock_movements`)과 통합 재고(`GET /stock`)를 확인한다. scm-api 만 있으면 된다 (Redis 불필요).
준비와 변수(`SCM`, `RUN`, `post`, `get`)는 [README.md](README.md). 규격: `packages/contracts/src/scm.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`. 설계: [../06-inbound-design.md](../06-inbound-design.md) "수량 원장".
시리얼 제품의 재고(개체 단위)는 [scm-api.md](scm-api.md) 14·27, [registration.md](registration.md).

이 플레이북은 제품·거점 코드에 `RUN` 을 붙여 같은 DB 에서 여러 번 돌릴 수 있다. 단계 1 에서 아래 변수와 함수를 만든다. 이후 단계가 같은 셸을 쓴다.

## 기준 정보

### 1. 제품 3종(NONE, LOT, SERIAL)과 거점 2곳

```sh
N=WH-N-$RUN; L=WH-L-$RUN; S=WH-S-$RUN; A=WH-A-$RUN; B=WH-B-$RUN
DB=lh_scm   # 서브에이전트는 자기 DB
stock() { curl -s $SCM/stock | jq -c ".[] | select(.sku|test(\"-$RUN\$\"))"; }
post $SCM/products "{\"sku\":\"$N\",\"name\":\"포장재\",\"trackingMode\":\"NONE\"}"
post $SCM/products "{\"sku\":\"$L\",\"name\":\"배터리 팩\",\"trackingMode\":\"LOT\"}"
post $SCM/products "{\"sku\":\"$S\",\"name\":\"카메라\",\"trackingMode\":\"SERIAL\"}"
post $SCM/locations "{\"code\":\"$A\",\"name\":\"인천 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}" | tail -1
post $SCM/locations "{\"code\":\"$B\",\"name\":\"부산 창고\",\"type\":\"WAREHOUSE\",\"partner\":\"3PL B\"}" | tail -1
```

기대: 제품 셋 `{"sku":"WH-N-<RUN>","name":"포장재","trackingMode":"NONE"}` · `{"sku":"WH-L-<RUN>","name":"배터리 팩","trackingMode":"LOT"}` · `{"sku":"WH-S-<RUN>","name":"카메라","trackingMode":"SERIAL"}` 각각 → 201, 거점 둘은 상태 줄만 `→ 201` 둘.

## 대량 기록

### 2. 입고 · 이동 · 출고 · 폐기를 한 번에 기록한다

```sh
SRC='"occurredAt":"2026-10-01T00:00:00Z","source":{"system":"wms-a","ref":"batch-1"}'
RES=$(curl -s -w '\n→ %{http_code}' -X POST $SCM/stock-movements -H 'content-type: application/json' -d "{\"movements\":[
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":100,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"r1-$RUN\"},
  {\"sku\":\"$L\",\"lotNo\":\"LOT-1\",\"toLocationCode\":\"$A\",\"quantity\":50,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"r2-$RUN\"},
  {\"sku\":\"$L\",\"toLocationCode\":\"$A\",\"quantity\":7,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"r3-$RUN\"},
  {\"sku\":\"$N\",\"fromLocationCode\":\"$A\",\"toLocationCode\":\"$B\",\"quantity\":30,\"reason\":\"TRANSFER\",$SRC,\"idempotencyKey\":\"t1-$RUN\"},
  {\"sku\":\"$N\",\"fromLocationCode\":\"$B\",\"quantity\":20,\"reason\":\"SHIPMENT\",$SRC,\"idempotencyKey\":\"s1-$RUN\"},
  {\"sku\":\"$L\",\"lotNo\":\"LOT-1\",\"fromLocationCode\":\"$A\",\"quantity\":5,\"stockStatus\":\"QC\",\"reason\":\"SCRAP\",$SRC,\"idempotencyKey\":\"x1-$RUN\"}
]}")
echo "$RES"
M_TRANSFER=$(echo "$RES" | head -1 | jq -r '.movements[3].movementId')
```

기대 → 201: 요청 항목 여섯 개와 같은 순서로 `movementId` 가 오고 모두 `duplicate` `false`.

```json
{
  "movements": [
    { "movementId": "<uuid>", "duplicate": false },
    { "movementId": "<uuid>", "duplicate": false },
    { "movementId": "<uuid>", "duplicate": false },
    { "movementId": "<uuid>", "duplicate": false },
    { "movementId": "<uuid>", "duplicate": false },
    { "movementId": "<uuid>", "duplicate": false }
  ]
}
```

(`lotNo`·`stockStatus` 를 생략한 항목은 로트 없음·`AVAILABLE` 로 기록된다. `LOT` 제품도 `lotNo` 를 생략할 수 있다. 네 번째 항목, 이동의 id 를 `M_TRANSFER` 에 담아 둔다.)

### 3. 재고 — 합이 수량 행으로 나온다

```sh
stock
```

기대 (순서까지 같다. 수량 행은 `status` `IN_STOCK`, `registered` `null`, 정렬은 sku → 거점 → 로트 → 재고 상태):

```text
{"sku":"WH-L-<RUN>","trackingMode":"LOT","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":7}
{"sku":"WH-L-<RUN>","trackingMode":"LOT","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":"LOT-1","stockStatus":"AVAILABLE","quantity":50}
{"sku":"WH-L-<RUN>","trackingMode":"LOT","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":"LOT-1","stockStatus":"QC","quantity":-5}
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":70}
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-B-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":10}
```

- `WH-N` 인천 = 입고 100 - 이동 30 = 70, 부산 = 이동 30 - 출고 20 = 10. 이동은 출발지에서 빼고 도착지에 더한다.
- 로트가 없는 7개(`lotNo` `null`)와 `LOT-1` 은 다른 행이다.
- `LOT-1` 의 `QC` 상태에는 들어온 것이 없고 폐기만 기록해서 `-5` 가 나온다. **음수는 그대로 돌려준다** (보고 오류를 드러내려는 것이다).

## 중복 키

### 4. 같은 idempotencyKey 는 다시 기록되지 않는다

세 항목: 이미 기록한 `r1` 의 재전송, 새 키 `new1`, 같은 요청 안에서 `new1` 을 또 보낸 것(수량이 다르다).

```sh
post $SCM/stock-movements "{\"movements\":[
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":100,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"r1-$RUN\"},
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"ADJUSTMENT\",$SRC,\"idempotencyKey\":\"new1-$RUN\"},
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":999,\"reason\":\"ADJUSTMENT\",$SRC,\"idempotencyKey\":\"new1-$RUN\"}
]}"
stock | grep "\"$N\"" | grep "\"$A\""
```

기대 → 201: 첫 항목의 `movementId` 는 2 에서 받은 첫 항목의 id 와 같고 `duplicate` `true`. 둘째는 새 id, `duplicate` `false`. 셋째는 둘째와 **같은 id**, `duplicate` `true` (수량 999 는 버려진다).

```json
{
  "movements": [
    { "movementId": "<2 의 첫 id>", "duplicate": true },
    { "movementId": "<X>", "duplicate": false },
    { "movementId": "<X>", "duplicate": true }
  ]
}
```

재고: `WH-N` 인천 `"quantity":71` (70 + 1. 100 과 999 는 더해지지 않았다).

## 거절

거절은 요청 전체를 되돌린다 (한 트랜잭션). 에러 `details` 의 `index` 는 요청 `movements` 안의 번호(0부터)다.
아래 요청은 모두 첫 항목이 올바르고 둘째가 틀렸다 — 첫 항목도 기록되지 않아야 한다 (8 에서 확인).

### 5. 시리얼 제품은 수량 이동으로 기록하지 않는다 — QUANTITY_TRACKING_ONLY

```sh
post $SCM/stock-movements "{\"movements\":[
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"bad1-$RUN\"},
  {\"sku\":\"$S\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"bad2-$RUN\"}
]}"
```

기대: `{"code":"QUANTITY_TRACKING_ONLY","message":"WH-S-<RUN> is serial-tracked; report its movements as unit events","details":{"index":1,"sku":"WH-S-<RUN>"}}` → 422

### 6. 모르는 SKU · 모르는 거점 — UNKNOWN_SKU, UNKNOWN_LOCATION

```sh
post $SCM/stock-movements "{\"movements\":[
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"bad3-$RUN\"},
  {\"sku\":\"NOPE-$RUN\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"bad4-$RUN\"}
]}"
post $SCM/stock-movements "{\"movements\":[
  {\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"bad5-$RUN\"},
  {\"sku\":\"$N\",\"fromLocationCode\":\"$A\",\"toLocationCode\":\"NOWHERE\",\"quantity\":1,\"reason\":\"TRANSFER\",$SRC,\"idempotencyKey\":\"bad6-$RUN\"}
]}"
```

기대:

- `{"code":"UNKNOWN_SKU","message":"Unknown sku NOPE-<RUN>","details":{"index":1,"sku":"NOPE-<RUN>"}}` → 422
- `{"code":"UNKNOWN_LOCATION","message":"Unknown location NOWHERE","details":{"index":1,"locationCode":"NOWHERE"}}` → 422

### 7. 요청 형식 — VALIDATION_FAILED

```sh
post $SCM/stock-movements "{\"movements\":[{\"sku\":\"$N\",\"quantity\":1,\"reason\":\"GOODS_RECEIPT\",$SRC}]}"
post $SCM/stock-movements "{\"movements\":[{\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":0,\"reason\":\"GOODS_RECEIPT\",$SRC}]}"
post $SCM/stock-movements '{"movements":[]}'
post $SCM/stock-movements "{\"movements\":[{\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":1,\"stockStatus\":\"BROKEN\",\"reason\":\"GOODS_RECEIPT\",$SRC}]}"
jq -n --arg sku $N --arg loc $A '{movements:[range(1001)|{sku:$sku,toLocationCode:$loc,quantity:1,reason:"GOODS_RECEIPT",occurredAt:"2026-10-01T00:00:00Z",source:{system:"x"}}]}' > /tmp/wh-1001.json
curl -s -w '\n→ %{http_code}\n' -X POST $SCM/stock-movements -H 'content-type: application/json' -d @/tmp/wh-1001.json
```

기대 → 모두 400 (거점이 둘 다 없는 것도 zod 가 거절한다):

```json
{"code":"VALIDATION_FAILED","details":[{"path":"movements.0","message":"fromLocationCode or toLocationCode is required"}]}
{"code":"VALIDATION_FAILED","details":[{"path":"movements.0.quantity","message":"Too small: expected number to be >=1"}]}
{"code":"VALIDATION_FAILED","details":[{"path":"movements","message":"Too small: expected array to have >=1 items"}]}
{"code":"VALIDATION_FAILED","details":[{"path":"movements.0.stockStatus","message":"Invalid option: expected one of \"AVAILABLE\"|\"HOLD\"|\"QC\""}]}
{"code":"VALIDATION_FAILED","details":[{"path":"movements","message":"Too big: expected array to have <=1000 items"}]}
```

### 8. 거절된 요청은 아무것도 남기지 않는다

```sh
stock | grep "\"$N\"" | grep "\"$A\""
docker-compose -p logistics-hub exec -T mysql mysql -uroot -proot $DB -e "select count(*) as rejected_rows from stock_movements where idempotency_key like 'bad%-$RUN'"
```

기대: 인천의 `WH-N` 은 4 와 같은 `"quantity":71`, `rejected_rows` `0` (5·6 의 올바른 첫 항목 `bad1`·`bad3`·`bad5` 가 기록되지 않았다).

## 정정 (역분개)

### 9. 이동 하나를 되돌린다 — 반대 방향의 이동이 추가된다

2 의 이동(인천 → 부산 30)을 되돌린다.

```sh
RV=$(curl -s -w '\n→ %{http_code}' -X POST $SCM/stock-movements/$M_TRANSFER/reversal -H 'content-type: application/json' -d '{"reason":"창고 지시 오류","actor":"operator-1"}')
echo "$RV"
REV1=$(echo "$RV" | head -1 | jq -r .movementId)
stock | grep "\"$N\""
```

기대: `{"movementId":"<uuid>"}` → 201 (정정으로 추가된 이동의 id. `REV1` 에 담는다). 재고: 부산으로 갔던 30 이 도로 인천으로 간다. 부산에는 출고 20 만 남아 **음수**:

```text
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":101}
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-B-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":-20}
```

(인천 71 + 30 = 101, 부산 10 - 30 = -20. 출고 20 은 이동 30 이 있다는 전제로 보고된 것이라, 이동을 되돌리면 그 전제가 사라져 부산이 음수가 된다.)

### 10. 이미 되돌린 이동 · 정정의 정정 · 없는 이동

```sh
post $SCM/stock-movements/$M_TRANSFER/reversal '{"reason":"다시","actor":"operator-1"}'
RV2=$(curl -s -w '\n→ %{http_code}' -X POST $SCM/stock-movements/$REV1/reversal -H 'content-type: application/json' -d '{"reason":"정정이 틀렸음","actor":"operator-2"}')
echo "$RV2"
stock | grep "\"$N\""
post $SCM/stock-movements/$REV1/reversal '{"reason":"또","actor":"operator-2"}'
post $SCM/stock-movements/00000000-0000-0000-0000-000000000000/reversal '{"reason":"x","actor":"y"}'
post $SCM/stock-movements/$M_TRANSFER/reversal '{"reason":"","actor":"y"}'
```

기대:

- `{"code":"MOVEMENT_ALREADY_REVERSED","message":"Stock movement <M_TRANSFER> was already reversed"}` → 409
- 정정의 정정은 허용된다: `{"movementId":"<uuid>"}` → 201. 재고는 이동이 되살아나 9 이전으로 돌아온다: 인천 `"quantity":71`, 부산 `"quantity":10`.
- `REV1` 을 또 되돌리면 `{"code":"MOVEMENT_ALREADY_REVERSED","message":"Stock movement <REV1> was already reversed"}` → 409
- `{"code":"MOVEMENT_NOT_FOUND","message":"No stock movement 00000000-0000-0000-0000-000000000000"}` → 404
- `{"code":"VALIDATION_FAILED","details":[{"path":"reason","message":"Too small: expected string to have >=1 characters"}]}` → 400

### 11. 원래 이동은 그대로이고, 정정은 별도 행이다

```sh
docker-compose -p logistics-hub exec -T mysql mysql -uroot -proot --default-character-set=utf8mb4 $DB -e "select m.reason, m.quantity, f.code as from_code, t.code as to_code, m.stock_status, m.source_system, m.source_ref, m.note, m.reverses_movement_id is not null as is_reversal from stock_movements m left join locations f on f.id=m.from_location_id left join locations t on t.id=m.to_location_id join products p on p.id=m.product_id where p.sku='$N' and (m.id='$M_TRANSFER' or m.reverses_movement_id is not null) order by m.id"
```

기대 (3행, 원래 이동 · 첫 정정 · 정정의 정정):

```text
reason      quantity  from_code      to_code        stock_status  source_system             source_ref    note                                    is_reversal
TRANSFER    30        WH-A-<RUN>     WH-B-<RUN>     AVAILABLE     wms-a                     batch-1       NULL                                    0
ADJUSTMENT  30        WH-B-<RUN>     WH-A-<RUN>     AVAILABLE     logistics-hub:correction  operator-1    reversal by operator-1: 창고 지시 오류  1
ADJUSTMENT  30        WH-A-<RUN>     WH-B-<RUN>     AVAILABLE     logistics-hub:correction  operator-2    reversal by operator-2: 정정이 틀렸음   1
```

### 12. 같은 이동을 동시에 정정하면 하나만 성공한다

```sh
curl -s -X POST $SCM/stock-movements -H 'content-type: application/json' -d "{\"movements\":[{\"sku\":\"$N\",\"toLocationCode\":\"$A\",\"quantity\":10,\"reason\":\"GOODS_RECEIPT\",$SRC}]}" > /tmp/wh-conc.json
CC=$(jq -r '.movements[0].movementId' /tmp/wh-conc.json)
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $SCM/stock-movements/$CC/reversal -H 'content-type: application/json' -d "{\"reason\":\"r$i\",\"actor\":\"a$i\"}" &
done
wait
docker-compose -p logistics-hub exec -T mysql mysql -uroot -proot $DB -e "select count(*) as reversals from stock_movements where reverses_movement_id='$CC'"
```

기대: 상태 코드는 `201` 하나와 `409` 다섯 (순서는 달라질 수 있다), `reversals` `1`.
(입고 10 과 그 정정이 상쇄되므로 재고는 그대로다.)

## 재고의 음수와 0

### 13. 가진 것보다 많이 출고하면 음수 행이 그대로 나오고, 합이 0 이면 행이 없다

```sh
post $SCM/stock-movements "{\"movements\":[{\"sku\":\"$N\",\"fromLocationCode\":\"$B\",\"quantity\":25,\"reason\":\"SHIPMENT\",$SRC,\"idempotencyKey\":\"neg1-$RUN\"}]}" | tail -1
post $SCM/stock-movements "{\"movements\":[
  {\"sku\":\"$L\",\"lotNo\":\"LOT-9\",\"toLocationCode\":\"$A\",\"quantity\":5,\"reason\":\"GOODS_RECEIPT\",$SRC,\"idempotencyKey\":\"z1-$RUN\"},
  {\"sku\":\"$L\",\"lotNo\":\"LOT-9\",\"fromLocationCode\":\"$A\",\"quantity\":5,\"reason\":\"SCRAP\",$SRC,\"idempotencyKey\":\"z2-$RUN\"}
]}" | tail -1
stock | grep -c LOT-9
stock | grep "\"$N\""
```

기대: 상태 줄 `→ 201` 둘. `LOT-9` 는 입고 5 와 폐기 5 가 상쇄되어 행이 없다 (`grep -c` → `0`). `WH-N` 은 부산에서 10 - 25 = `-15`:

```text
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":71}
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-B-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":-15}
```

## 통합 재고

### 14. 시리얼 개체의 행과 수량 행이 한 응답에 나온다

```sh
post $SCM/unit-events "{\"serialNumber\":\"WH-SN-$RUN\",\"sku\":\"$S\",\"type\":\"RECEIVED\",\"occurredAt\":\"2026-10-01T00:00:00Z\",\"locationCode\":\"$A\",\"source\":{\"system\":\"wms-a\"}}"
stock
```

기대: 기록 `{"eventId":"<uuid>","duplicate":false}` → 201. 재고는 **시리얼 행이 먼저**(개체 상태 · 등록 여부 순), 그다음 수량 행이다:

```text
{"sku":"WH-S-<RUN>","trackingMode":"SERIAL","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":false,"lotNo":null,"stockStatus":null,"quantity":1}
{"sku":"WH-L-<RUN>","trackingMode":"LOT","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":7}
… (3 의 나머지 LOT 행 둘)
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-A-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":71}
{"sku":"WH-N-<RUN>","trackingMode":"NONE","locationCode":"WH-B-<RUN>","status":"IN_STOCK","registered":null,"lotNo":null,"stockStatus":"AVAILABLE","quantity":-15}
```

`trackingMode` 는 행의 근거를 뜻한다: 개체(`unit_events`)로 센 행은 `SERIAL`, 원장으로 합산한 행은 제품의 추적 방식이다.
