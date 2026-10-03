# transport 플레이북

준비와 변수(`SCM`, `post`, `get`)는 [README.md](README.md). scm-api 와 MySQL 만 있으면 된다 (Redis 불필요: `REDIS_URL=` 을 비워 띄워도 된다). `jq` 를 쓴다.
규격: `packages/contracts/src/transport.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`. 규칙: [../02-domain-model.md](../02-domain-model.md) "선적".
화면은 [web-console.md](web-console.md) 의 선적 단계.

이 플레이북은 **빈 DB** 에서 처음부터 돌린 값이다 (서브에이전트 구성: 포트 3901, DB `lh_scm_tr`, `REDIS_URL=`). 발주 번호는 허브가 채번하므로 다른 데이터가 있으면 번호가 다르다.
아래 "관찰" 블록은 실제 응답이고, 매번 달라지는 값만 바꿨다: `UNLINKED-<id>`(연결되지 않은 선적의 번호), `<uuid>`, `<시각>`. 단계 2·5·7·8 에서 받은 번호를 변수(`PO1`…`PO4`, `UNL`, `UNL2`)에 담아 뒤 단계에서 쓴다.
DB 를 보는 단계는 다음 함수를 쓴다 (컨테이너 이름은 환경에 맞춘다):

```sh
sql() { docker exec logistics-hub-mysql-1 mysql --default-character-set=utf8mb4 -uroot -proot lh_scm_tr -e "$1" 2>&1 | grep -v 'Using a password'; }
```

선적은 업체가 보고한 사실이라 **거부하지 않고 기록한다.** 거절은 마스터 데이터에 없는 SKU 뿐이다. 이상은 응답과 조회에 `anomalies` 로 실린다 (코드: `ShipmentAnomalyCode`).
단계 4–8 은 제출, 9–11 은 조회, 12–14 는 운영자의 연결 명령, 15 는 선적 단위 제품 등록, 16–17 은 동시성과 대량이다.

### 1. 제품과 거점

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}'
post $SCM/products '{"sku":"LENS-01","name":"렌즈","trackingMode":"NONE"}'
post $SCM/locations '{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B"}' | cut -c1-120
```

관찰:

```
{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}
→ 201
{"sku":"LENS-01","name":"렌즈","trackingMode":"NONE"}
→ 201
{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B","policy":{"reportsSerialsOnReceipt":true,"reportsSe
→ 201
```

각각 201.

### 2. 발주 세 건: 발행 둘, 초안 하나

`PO1`(카메라 4, 렌즈 50)과 `PO3`(렌즈 10)을 발행하고 `PO2`(카메라 1)는 초안으로 둔다.

```sh
mk() { curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d "$1" | jq -r .poNumber; }
PO1=$(mk '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":4,"requestedDeliveryDate":"2026-11-15"},{"sku":"LENS-01","orderedQty":50,"requestedDeliveryDate":"2026-11-30"}]}')
PO2=$(mk '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":1,"requestedDeliveryDate":"2026-11-15"}]}')
PO3=$(mk '{"supplier":"Other Ltd","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"LENS-01","orderedQty":10,"requestedDeliveryDate":"2026-11-30"}]}')
echo "PO1=$PO1 PO2=$PO2 PO3=$PO3"
post $SCM/purchase-orders/$PO1/issue '{"actor":"buyer-1"}' | tail -1
post $SCM/purchase-orders/$PO3/issue '{"actor":"buyer-1"}' | tail -1
```

관찰:

```
PO1=PO-2026-000001 PO2=PO-2026-000002 PO3=PO-2026-000003
→ 201
→ 201
```

이후 `$PO1` `$PO2` `$PO3` 으로 쓴다. 빈 DB 면 `PO-2026-000001`~`3`.

### 3. 거절: 모르는 SKU, 형식 오류, 시리얼 총수 상한

모르는 SKU 만 거절한다(마스터 데이터가 있어야 한다). 형식이 틀린 것은 400.

```sh
post $SCM/shipments/intake '{"shipments":[{"poNumber":"PO-2026-000001","blNumber":"BL-1","shipper":"ACME","mode":"SEA","lines":[{"sku":"CAM-01","quantity":1},{"sku":"NOPE","quantity":1}],"source":{"system":"acme-portal"}}]}'
post $SCM/shipments/intake '{"shipments":[]}'
post $SCM/shipments/intake '{"shipments":[{"poNumber":"PO-2026-000001","blNumber":"BL-1","shipper":"ACME","mode":"TRAIN","shipDate":"2026-13-40","lines":[{"sku":"CAM-01","quantity":0}],"source":{"system":"acme-portal"}}]}'
seq 1 50001 | jq -R -s -c '{shipments:[{poNumber:"X",blNumber:"B",shipper:"A",mode:"SEA",lines:[{sku:"CAM-01",quantity:50001,serialNumbers:(split("\n")|map(select(.!=""))|map("OVER-"+.))}],source:{system:"a"}}]}' > /tmp/over-$$.json
curl -s -w '\n→ %{http_code}\n' -X POST $SCM/shipments/intake -H 'content-type: application/json' --data-binary @/tmp/over-$$.json; rm /tmp/over-$$.json
get $SCM/shipments/NOPE
get "$SCM/shipments?unlinked=maybe"
```

관찰:

```
{"code":"UNKNOWN_SKU","message":"Unknown sku NOPE","details":{"index":0,"lineNo":2,"sku":"NOPE"}}
→ 422
{"code":"VALIDATION_FAILED","details":[{"path":"shipments","message":"Too small: expected array to have >=1 items"}]}
→ 400
{"code":"VALIDATION_FAILED","details":[{"path":"shipments.0.mode","message":"Invalid option: expected one of \"SEA\"|\"AIR\"|\"ROAD\""},{"path":"shipments.0.shipDate","message":"Invalid ISO date"},{"path":"shipments.0.lines.0.quantity","message":"Too small: expected number to be >=1"}]}
→ 400
{"code":"VALIDATION_FAILED","details":[{"path":"shipments.0.lines.0.serialNumbers","message":"Too big: expected array to have <=50000 items"},{"path":"","message":"At most 50000 serial numbers per request"}]}
→ 400
{"code":"SHIPMENT_NOT_FOUND","message":"Unknown shipment NOPE"}
→ 404
{"code":"VALIDATION_FAILED","details":[{"path":"unlinked","message":"Invalid option: expected one of \"true\"|\"1\"|\"yes\"|\"on\"|\"y\"|\"enabled\"|\"false\"|\"0\"|\"no\"|\"off\"|\"n\"|\"disabled\""}]}
→ 400
```

### 4. 1차 제출 (이상 없음)

발주 번호가 `ISSUED` 발주를 가리키면 그 발주의 첫 차수(`-R1`)가 된다. 카메라 시리얼 2개는 제품 이력의 `DISPATCHED` 가 된다(단계 11).

```sh
post $SCM/shipments/intake '{"shipments":[{"poNumber":"PO-2026-000001","blNumber":"BL-A1","invoiceNumber":"INV-1","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-01","eta":"2026-10-20","lines":[{"sku":"CAM-01","quantity":2,"serialNumbers":["CAM-0001","CAM-0002"]},{"sku":"LENS-01","quantity":20,"lotNo":"LOT-9"}],"source":{"system":"acme-portal","ref":"sub-1"},"idempotencyKey":"acme-sub-1"}]}'
```

관찰:

```
{"shipments":[{"shipmentNo":"PO-2026-000001-R1","duplicate":false,"poNumber":"PO-2026-000001","anomalies":[]}]}
→ 201
```

### 5. 2차 제출: 시리얼 수 불일치 + 선적 누계 초과, 같은 요청의 모르는 발주 번호

한 요청에 두 건. 앞은 같은 발주의 다음 차수(`-R2`)이고 시리얼 2개에 수량 3이라 `SERIAL_COUNT_MISMATCH`, 카메라 누계 5가 주문 4를 넘어 `OVER_SHIPPED`. 뒤는 모르는 발주 번호라 **기록하되** `PO_UNLINKED` 로 표시하고 번호는 `UNLINKED-…` 다.

```sh
OUT=$(curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"PO-2026-000001","blNumber":"BL-A2","shipper":"ACME Shenzhen","mode":"AIR","shipDate":"2026-10-03","lines":[{"sku":"CAM-01","quantity":3,"serialNumbers":["CAM-0003","CAM-0004"]}],"source":{"system":"acme-portal","ref":"sub-2"},"idempotencyKey":"acme-sub-2"},{"poNumber":"PO-2026-999999","blNumber":"BL-X1","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-02","lines":[{"sku":"CAM-01","quantity":1,"serialNumbers":["CAM-0005"]}],"source":{"system":"acme-portal","ref":"sub-3"},"idempotencyKey":"acme-sub-3"}]}')
echo "$OUT" | jq .
UNL=$(echo "$OUT" | jq -r '.shipments[1].shipmentNo'); echo "UNL=$UNL"
```

관찰:

```
{
  "shipments": [
    {
      "shipmentNo": "PO-2026-000001-R2",
      "duplicate": false,
      "poNumber": "PO-2026-000001",
      "anomalies": [
        {
          "code": "OVER_SHIPPED",
          "message": "발주 줄 1 (CAM-01) 선적 누계 5 이(가) 주문 4 + 과납 허용을 넘음",
          "lineNo": 1
        },
        {
          "code": "SERIAL_COUNT_MISMATCH",
          "message": "CAM-01 시리얼 2개, 수량 3",
          "lineNo": 1
        }
      ]
    },
    {
      "shipmentNo": "UNLINKED-<id>",
      "duplicate": false,
      "poNumber": null,
      "anomalies": [
        {
          "code": "PO_UNLINKED",
          "message": "발주 번호 PO-2026-999999 를 알 수 없음",
          "lineNo": null
        }
      ]
    }
  ]
}
UNL=UNLINKED-<id>
```

`$UNL` 은 연결되지 않은 선적의 번호다.

### 6. 같은 idempotencyKey 로 다시 제출: 중복

1·3번 제출을 그대로 다시 보낸다. 새로 기록하지 않고 기존 선적을 가리킨다(`duplicate: true`). 돌려주는 이상은 받을 때의 값이다.

```sh
post $SCM/shipments/intake '{"shipments":[{"poNumber":"PO-2026-000001","blNumber":"BL-A1","shipper":"ACME Shenzhen","mode":"SEA","lines":[{"sku":"CAM-01","quantity":2,"serialNumbers":["CAM-0001","CAM-0002"]}],"source":{"system":"acme-portal"},"idempotencyKey":"acme-sub-1"},{"poNumber":"PO-2026-999999","blNumber":"BL-X1","shipper":"ACME Shenzhen","mode":"SEA","lines":[{"sku":"CAM-01","quantity":1,"serialNumbers":["CAM-0005"]}],"source":{"system":"acme-portal"},"idempotencyKey":"acme-sub-3"}]}'
sql "select shipment_no, purchase_order_id is not null as linked, idempotency_key from shipments order by id; select count(*) as dispatched_events from unit_events where type='DISPATCHED';"
```

관찰:

```
{"shipments":[{"shipmentNo":"PO-2026-000001-R1","duplicate":true,"poNumber":"PO-2026-000001","anomalies":[]},{"shipmentNo":"UNLINKED-<id>","duplicate":true,"poNumber":null,"anomalies":[{"code":"PO_UNLINKED","lineNo":null,"message":"발주 번호 PO-2026-999999 를 알 수 없음"}]}]}
→ 201
shipment_no	linked	idempotency_key
PO-2026-000001-R1	1	acme-sub-1
PO-2026-000001-R2	1	acme-sub-2
UNLINKED-<id>	0	acme-sub-3
dispatched_events
5
```

선적은 세 건 그대로이고 `DISPATCHED` 는 시리얼 5개만큼(5)이다. DB 의 JSON 은 키 순서를 정규화하므로 저장된 이상은 `code, lineNo, message` 순으로 돌아온다.

### 7. 그 밖의 이상: 초안 발주, 다른 선적에 있는 시리얼, 시리얼 추적이 아닌 제품의 시리얼, 다른 SKU 로 있는 시리얼

`MIX-1` 은 렌즈로 이미 등록된 개체다. 초안(`PO2`)을 가리키는 제출에 `CAM-0001`(1차 선적에 있음), `MIX-1`, 렌즈 줄의 시리얼을 싣는다.

```sh
post $SCM/unit-events '{"serialNumber":"MIX-1","sku":"LENS-01","type":"MANUFACTURED","occurredAt":"2026-09-01T00:00:00Z","locationCode":"WH-ICN","source":{"system":"seed"}}'
OUT=$(curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "{\"shipments\":[{\"poNumber\":\"$PO2\",\"blNumber\":\"BL-M1\",\"shipper\":\"ACME Shenzhen\",\"mode\":\"ROAD\",\"lines\":[{\"sku\":\"CAM-01\",\"quantity\":2,\"serialNumbers\":[\"CAM-0001\",\"MIX-1\"]},{\"sku\":\"LENS-01\",\"quantity\":1,\"serialNumbers\":[\"LNS-1\"]}],\"source\":{\"system\":\"acme-portal\"}}]}")
echo "$OUT" | jq .
UNL2=$(echo "$OUT" | jq -r '.shipments[0].shipmentNo'); echo "UNL2=$UNL2"
get $SCM/units/MIX-1 | head -1 | jq -c '{status, events: [.events[].type]}'
sql "select count(*) as units_named_LNS from units where serial_number='LNS-1';"
```

관찰:

```
{"eventId":"<uuid>","duplicate":false}
→ 201
{
  "shipments": [
    {
      "shipmentNo": "UNLINKED-<id>",
      "duplicate": false,
      "poNumber": null,
      "anomalies": [
        {
          "code": "PO_UNLINKED",
          "message": "발주 PO-2026-000002 가 DRAFT 상태라 연결하지 못함 (ISSUED 아님)",
          "lineNo": null
        },
        {
          "code": "DUPLICATE_SERIAL",
          "message": "다른 선적에 이미 있는 시리얼: CAM-0001",
          "lineNo": 1
        },
        {
          "code": "SERIAL_SKU_CONFLICT",
          "message": "이미 다른 SKU 로 등록된 시리얼 (CAM-01 가 아님): MIX-1. 이력을 남기지 않음",
          "lineNo": 1
        },
        {
          "code": "SERIALS_ON_UNTRACKED_PRODUCT",
          "message": "LENS-01 은(는) 시리얼 추적 제품이 아닌데 시리얼 1개가 옴 (개체는 만들지 않음)",
          "lineNo": 2
        }
      ]
    }
  ]
}
UNL2=UNLINKED-<id>
{"status":"PRODUCED","events":["MANUFACTURED"]}
units_named_LNS
0
```

모든 이상이 한 선적에 표시된다. 렌즈 줄의 시리얼은 개체를 만들지 않고(`units_named_LNS` 0), `MIX-1` 은 이력이 늘지 않는다(`MANUFACTURED` 하나뿐).

### 8. 닫힌·취소된 발주 줄

발주 줄을 닫거나(미달 납품 선언) 개정으로 취소한 뒤에도 그 줄로 선적이 오면 거부하지 않고 기록한다. 같은 제품의 열린 줄이 없으면 닫힌 줄, 그것도 없으면 취소한 줄에 맞춘다.

```sh
mk() { curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d "$1" | jq -r .poNumber; }
PO4=$(mk '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":2,"requestedDeliveryDate":"2026-11-15"},{"sku":"LENS-01","orderedQty":2,"requestedDeliveryDate":"2026-11-30"}]}')
post $SCM/purchase-orders/$PO4/issue '{"actor":"buyer-1"}' | tail -1
post $SCM/purchase-orders/$PO4/lines/2/close '{"reason":"제조사가 더 안 보낸다고 함","actor":"buyer-1"}' | tail -1
post $SCM/purchase-orders/$PO4/revisions '{"reason":"카메라 줄 취소","actor":"buyer-1","changes":{"cancelLines":[1]}}' | tail -1
curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "{\"shipments\":[{\"poNumber\":\"$PO4\",\"blNumber\":\"BL-P4\",\"shipper\":\"ACME Shenzhen\",\"mode\":\"SEA\",\"lines\":[{\"sku\":\"CAM-01\",\"quantity\":1,\"serialNumbers\":[\"CAM-0900\"]},{\"sku\":\"LENS-01\",\"quantity\":1}],\"source\":{\"system\":\"acme-portal\"}}]}" | jq .
```

관찰:

```
PO4=PO-2026-000004
→ 201
→ 201
→ 201
{
  "shipments": [
    {
      "shipmentNo": "PO-2026-000004-R1",
      "duplicate": false,
      "poNumber": "PO-2026-000004",
      "anomalies": [
        {
          "code": "PO_LINE_CANCELLED",
          "message": "CAM-01 이(가) 취소된 발주 줄 1 으로 선적됨",
          "lineNo": 1
        },
        {
          "code": "PO_LINE_CLOSED",
          "message": "LENS-01 이(가) 닫힌 발주 줄 2 으로 선적됨",
          "lineNo": 2
        }
      ]
    }
  ]
}
```

발주 줄 1 은 취소, 줄 2 는 닫힌 상태라 각각 `PO_LINE_CANCELLED`, `PO_LINE_CLOSED` 로 표시되고, 선적은 `-R1` 로 연결된다.

### 9. 조회: 목록, 발주별, 미연결

최근 50건(도착 순서의 역순).

```sh
get $SCM/shipments | head -1 | jq -c '.[] | {shipmentNo, poNumber, reportedPoNumber, lineCount, totalQty, serialCount, anomalyCount}'
curl -s "$SCM/shipments?poNumber=PO-2026-000001" | jq -c '.[] | {shipmentNo, poNumber, anomalyCount}'
curl -s "$SCM/shipments?unlinked=true" | jq -c '.[] | {shipmentNo, reportedPoNumber, anomalyCount}'
get "$SCM/shipments?poNumber=PO-NOPE"
get $SCM/shipments/PO-2026-000001-R2
```

관찰:

```
{"shipmentNo":"PO-2026-000004-R1","poNumber":"PO-2026-000004","reportedPoNumber":"PO-2026-000004","lineCount":2,"totalQty":2,"serialCount":1,"anomalyCount":2}
{"shipmentNo":"UNLINKED-<id>","poNumber":null,"reportedPoNumber":"PO-2026-000002","lineCount":2,"totalQty":3,"serialCount":3,"anomalyCount":4}
{"shipmentNo":"UNLINKED-<id>","poNumber":null,"reportedPoNumber":"PO-2026-999999","lineCount":1,"totalQty":1,"serialCount":1,"anomalyCount":1}
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","lineCount":1,"totalQty":3,"serialCount":2,"anomalyCount":2}
{"shipmentNo":"PO-2026-000001-R1","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","lineCount":2,"totalQty":22,"serialCount":2,"anomalyCount":0}
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","anomalyCount":2}
{"shipmentNo":"PO-2026-000001-R1","poNumber":"PO-2026-000001","anomalyCount":0}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-000002","anomalyCount":4}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-999999","anomalyCount":1}
[]
→ 200
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","blNumber":"BL-A2","invoiceNumber":null,"shipper":"ACME Shenzhen","mode":"AIR","shipDate":"2026-10-03","eta":null,"source":{"system":"acme-portal","ref":"sub-2"},"reportedAt":"<시각>","recordedAt":"<시각>","lineCount":1,"totalQty":3,"serialCount":2,"anomalyCount":2,"note":null,"lines":[{"lineNo":1,"sku":"CAM-01","quantity":3,"lotNo":null,"poLineNo":1,"serialCount":2}],"anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 5 이(가) 주문 4 + 과납 허용을 넘음"},{"code":"SERIAL_COUNT_MISMATCH","lineNo":1,"message":"CAM-01 시리얼 2개, 수량 3"}],"link":null}
→ 200
```

### 10. 발주 조회: 줄마다 선적 누계

`shippedQty` 는 발주 줄에 연결된 선적 줄의 합이다. 줄 완료(`completion`)는 **받은** 수량으로 계산하므로 선적이 아무리 많아도 `OPEN` 이고 `receivedQty` 는 0 이다(입고는 6단계).

```sh
get $SCM/purchase-orders/$PO1 | head -1 | jq -c '.lines[] | {lineNo, sku, orderedQty, receivedQty, shippedQty, openQty, completion}'
```

관찰:

```
{"lineNo":1,"sku":"CAM-01","orderedQty":4,"receivedQty":0,"shippedQty":5,"openQty":4,"completion":"OPEN"}
{"lineNo":2,"sku":"LENS-01","orderedQty":50,"receivedQty":0,"shippedQty":20,"openQty":50,"completion":"OPEN"}
```

### 11. 제품 이력: 선적 참조가 붙은 DISPATCHED

`DISPATCHED` 의 출처 참조(`source.ref`)가 선적 번호다. 발주·선적 단위로 개체를 거슬러 올라갈 수 있다. 개체의 이력은 이 사실에서 시작하고 `UNKNOWN` 에서의 `DISPATCHED` 는 정상이라 이상이 붙지 않는다(`CAM-0005`). 이미 `IN_TRANSIT` 인 개체에 다른 선적이 또 출발을 보고한 `CAM-0001` 의 두 번째 사실만 이상이다.

```sh
get $SCM/units/CAM-0001 | head -1 | jq -c '{serialNumber, status, anomalies, events: [.events[] | {type, occurredAt, source}]}'
get $SCM/units/CAM-0005 | head -1 | jq -c '{serialNumber, status, events: [.events[] | {type, source}]}'
sql "select count(*) as units from units; select count(*) as dispatched from unit_events where type='DISPATCHED';"
```

관찰:

```
{"serialNumber":"CAM-0001","status":"IN_TRANSIT","anomalies":["<시각> DISPATCHED: IN_TRANSIT 상태에서 올 수 없는 사실"],"events":[{"type":"DISPATCHED","occurredAt":"2026-10-01T00:00:00.000Z","source":{"system":"acme-portal","ref":"PO-2026-000001-R1"}},{"type":"DISPATCHED","occurredAt":"<시각>","source":{"system":"acme-portal","ref":"UNLINKED-<id>"}}]}
{"serialNumber":"CAM-0005","status":"IN_TRANSIT","events":[{"type":"DISPATCHED","source":{"system":"acme-portal","ref":"UNLINKED-<id>"}}]}
units
7
dispatched
7
```

### 12. 연결 명령의 거절

우리가 내리는 명령이라 전제가 맞지 않으면 거절한다.

```sh
post $SCM/shipments/NOPE/link '{"poNumber":"PO-2026-000001","actor":"op-1","reason":"x"}'
post $SCM/shipments/$UNL/link '{"poNumber":"PO-2026-999999","actor":"op-1","reason":"x"}'
post $SCM/shipments/$UNL/link "{\"poNumber\":\"$PO2\",\"actor\":\"op-1\",\"reason\":\"x\"}"
post $SCM/shipments/PO-2026-000001-R1/link '{"poNumber":"PO-2026-000001","actor":"op-1","reason":"x"}'
post $SCM/shipments/$UNL/link "{\"poNumber\":\"$PO3\",\"actor\":\"op-1\",\"reason\":\"x\"}"
post $SCM/shipments/$UNL/link '{"poNumber":"PO-2026-000001"}'
sql "select count(*) as links from shipment_links;"
```

관찰:

```
{"code":"SHIPMENT_NOT_FOUND","message":"Unknown shipment NOPE"}
→ 404
{"code":"PO_NOT_FOUND","message":"Unknown purchase order PO-2026-999999"}
→ 404
{"code":"PO_NOT_ISSUED","message":"PO-2026-000002 is DRAFT; only an issued purchase order can take shipments"}
→ 409
{"code":"SHIPMENT_ALREADY_LINKED","message":"Shipment PO-2026-000001-R1 is already linked to a purchase order"}
→ 409
{"code":"SHIPMENT_LINES_UNMATCHED","message":"PO-2026-000003 has no line for CAM-01","details":{"lines":[{"lineNo":1,"sku":"CAM-01"}]}}
→ 422
{"code":"VALIDATION_FAILED","details":[{"path":"actor","message":"Invalid input: expected string, received undefined"},{"path":"reason","message":"Invalid input: expected string, received undefined"}]}
→ 400
links
0
```

거절은 아무것도 바꾸지 않는다(`links` 0).

### 13. 연결: 제조사가 발주 번호를 잘못 적은 선적을 PO1 에 연결

선적은 `PO1` 의 다음 차수(`-R3`)를 받는다. 이미 번호를 받은 R1·R2 는 바뀌지 않는다. 보고된 발주 번호(`reportedPoNumber`)와 시리얼은 그대로다. 연결 시점의 누계(6)가 주문(4)을 넘으므로 `OVER_SHIPPED` 가 연결 기록에 남는다.

```sh
post $SCM/shipments/$UNL/link '{"poNumber":"PO-2026-000001","actor":"op-1","reason":"제조사가 발주 번호를 잘못 적음"}'
```

관찰:

```
{"shipmentNo":"PO-2026-000001-R3","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-999999","blNumber":"BL-X1","invoiceNumber":null,"shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-02","eta":null,"source":{"system":"acme-portal","ref":"sub-3"},"reportedAt":"<시각>","recordedAt":"<시각>","lineCount":1,"totalQty":1,"serialCount":1,"anomalyCount":1,"note":null,"lines":[{"lineNo":1,"sku":"CAM-01","quantity":1,"lotNo":null,"poLineNo":1,"serialCount":1}],"anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 6 이(가) 주문 4 + 과납 허용을 넘음"}],"link":{"previousShipmentNo":"UNLINKED-<id>","poNumber":"PO-2026-000001","actor":"op-1","reason":"제조사가 발주 번호를 잘못 적음","linkedAt":"<시각>","anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 6 이(가) 주문 4 + 과납 허용을 넘음"}]}}
→ 201
```

### 14. 연결 뒤: 옛 번호 조회, 미연결 목록, 발주 조회, DB

```sh
curl -s $SCM/shipments/$UNL | jq -c '{shipmentNo, poNumber, reportedPoNumber, anomalyCount, previous: .link.previousShipmentNo}'
curl -s "$SCM/shipments?unlinked=true" | jq -c '.[] | {shipmentNo, reportedPoNumber}'
get $SCM/purchase-orders/$PO1 | head -1 | jq -c '.lines[] | {lineNo, sku, orderedQty, receivedQty, shippedQty, completion}'
sql "select shipment_no, reported_po_number, purchase_order_id is not null as linked from shipments order by id;"
sql "select previous_shipment_no, shipment_no, actor, reason from shipment_links;"
get $SCM/units/CAM-0005 | head -1 | jq -c '.events[] | {type, source}'
```

관찰:

```
{"shipmentNo":"PO-2026-000001-R3","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-999999","anomalyCount":1,"previous":"UNLINKED-<id>"}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-000002"}
{"lineNo":1,"sku":"CAM-01","orderedQty":4,"receivedQty":0,"shippedQty":6,"completion":"OPEN"}
{"lineNo":2,"sku":"LENS-01","orderedQty":50,"receivedQty":0,"shippedQty":20,"completion":"OPEN"}
shipment_no	reported_po_number	linked
PO-2026-000001-R1	PO-2026-000001	1
PO-2026-000001-R2	PO-2026-000001	1
PO-2026-000001-R3	PO-2026-999999	1
UNLINKED-<id>	PO-2026-000002	0
PO-2026-000004-R1	PO-2026-000004	1
previous_shipment_no	shipment_no	actor	reason
UNLINKED-<id>	PO-2026-000001-R3	op-1	제조사가 발주 번호를 잘못 적음
{"type":"DISPATCHED","source":{"system":"acme-portal","ref":"UNLINKED-<id>"}}
```

미연결 목록에는 단계 7 의 초안 발주 선적만 남는다. `CAM-0005` 의 `DISPATCHED` 는 추가만 하는 사실이라 기록 당시 번호(`UNLINKED-…`)를 그대로 가리키고, 그 번호로도 선적을 찾을 수 있다.

### 15. 선적 단위 제품 등록

입고 보고는 6단계라서, 1차 선적의 `CAM-0001` 만 `RECEIVED` 를 직접 넣는다. 그다음 선적 번호로 등록하면 `CAM-0002` 는 입고 전이라 제외된다(같은 제외 규칙).

```sh
post $SCM/unit-events '{"serialNumber":"CAM-0001","type":"RECEIVED","occurredAt":"2026-10-10T00:00:00Z","locationCode":"WH-ICN","source":{"system":"3PL B"}}'
post $SCM/unit-registrations '{"shipmentNo":"PO-2026-000001-R1","serialNumbers":["CAM-0001"],"actor":"op-1"}'
post $SCM/unit-registrations '{"shipmentNo":"NOPE","actor":"op-1"}'
post $SCM/unit-registrations '{"shipmentNo":"PO-2026-000001-R1","actor":"op-1"}'
post $SCM/unit-registrations '{"shipmentNo":"PO-2026-000001-R1","actor":"op-1"}'
post $SCM/unit-registrations "{\"shipmentNo\":\"$UNL\",\"actor\":\"op-1\"}"
get $SCM/units/CAM-0001 | head -1 | jq -c '{status, registered: (.registeredAt != null), events: [.events[] | {type, source}]}'
```

관찰:

```
{"eventId":"<uuid>","duplicate":false}
→ 201
{"code":"VALIDATION_FAILED","details":[{"path":"","message":"Invalid input"}]}
→ 400
{"code":"SHIPMENT_NOT_FOUND","message":"Unknown shipment NOPE"}
→ 404
{"requestId":"<uuid>","registered":["CAM-0001"],"excluded":[{"serialNumber":"CAM-0002","reason":"NOT_IN_STOCK"}]}
→ 201
{"requestId":null,"registered":[],"excluded":[{"serialNumber":"CAM-0001","reason":"ALREADY_REGISTERED"},{"serialNumber":"CAM-0002","reason":"NOT_IN_STOCK"}]}
→ 201
{"requestId":null,"registered":[],"excluded":[{"serialNumber":"CAM-0005","reason":"NOT_IN_STOCK"}]}
→ 201
{"status":"IN_STOCK","registered":true,"events":[{"type":"DISPATCHED","source":{"system":"acme-portal","ref":"PO-2026-000001-R1"}},{"type":"DISPATCHED","source":{"system":"acme-portal","ref":"UNLINKED-<id>"}},{"type":"REGISTERED","source":{"system":"logistics-hub","ref":"op-1"}},{"type":"RECEIVED","source":{"system":"3PL B","ref":null}}]}
```

### 16. 동시 요청

같은 키·같은 발주·같은 새 시리얼이 동시에 와도 500 이 나지 않는다. 진 요청은 처음부터 다시 해서 이긴 요청의 커밋을 본다(서버 로그에 `lost a race` 경고).

```sh
mk() { echo "{\"shipments\":[{\"poNumber\":\"$PO3\",\"blNumber\":\"$1\",\"shipper\":\"Other Ltd\",\"mode\":\"ROAD\",\"lines\":[{\"sku\":\"LENS-01\",\"quantity\":1}],\"source\":{\"system\":\"other-edi\"}${2:+,\"idempotencyKey\":\"$2\"}}]}"; }
echo "# (a) 같은 idempotencyKey 8건 동시"
for i in 1 2 3 4 5 6 7 8; do curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "$(mk BL-RACE race-key-1)" | jq -c '.shipments[0] | [.shipmentNo, .duplicate]' & done; wait
sql "select count(*) as shipments_with_key from shipments where idempotency_key='race-key-1';"
echo "# (b) 같은 발주에 키 없는 제출 6건 동시"
for i in 1 2 3 4 5 6; do curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "$(mk BL-ROUND-$i)" >/dev/null & done; wait
sql "select shipment_no from shipments where purchase_order_id = (select id from purchase_orders where po_number='$PO3') order by id;"
echo "# (c) 같은 새 시리얼을 담은 서로 다른 제출 8건 동시"
for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w '%{http_code} ' -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "{\"shipments\":[{\"poNumber\":\"PO-NONE\",\"blNumber\":\"BL-C$i\",\"shipper\":\"X\",\"mode\":\"SEA\",\"lines\":[{\"sku\":\"CAM-01\",\"quantity\":3,\"serialNumbers\":[\"RACE-1\",\"RACE-2\",\"RACE-3\"]}],\"source\":{\"system\":\"x\"}}]}" & done; wait; echo
sql "select count(*) as units from units where serial_number like 'RACE-%'; select count(*) as dispatched from unit_events e join units u on u.id=e.unit_id where u.serial_number like 'RACE-%' and e.type='DISPATCHED';"
```

관찰:

```
# (a) 같은 idempotencyKey 8건 동시
["PO-2026-000003-R1",false]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
["PO-2026-000003-R1",true]
shipments_with_key
1
# (b) 같은 발주에 키 없는 제출 6건 동시
shipment_no
PO-2026-000003-R1
PO-2026-000003-R2
PO-2026-000003-R3
PO-2026-000003-R4
PO-2026-000003-R5
PO-2026-000003-R6
PO-2026-000003-R7
# (c) 같은 새 시리얼을 담은 서로 다른 제출 8건 동시
201 201 201 201 201 201 201 201
units
3
dispatched
24
```

(a) 응답 8개 중 `false` 가 하나, 나머지 `true`, 같은 번호. (b) 차수가 겹치지 않고 이어진다. (c) 상태 코드가 모두 201, 개체 3개, 사실 24건(8 선적 × 3).

### 17. 대량: 시리얼 5000개 한 줄

요청 본문 한도는 4MB, 요청당 시리얼 총수 상한은 50,000 이다.

```sh
seq 1 5000 | jq -R -s -c '{shipments:[{poNumber:"PO-2026-000001",blNumber:"BL-BULK",shipper:"ACME",mode:"SEA",lines:[{sku:"CAM-01",quantity:5000,serialNumbers:(split("\n")|map(select(.!=""))|map("BULK-"+.))}],source:{system:"acme-portal"}}]}' > /tmp/bulk-$$.json
curl -s -o /tmp/bulk-out-$$.json -w 'http %{http_code}\n' -X POST $SCM/shipments/intake -H 'content-type: application/json' --data-binary @/tmp/bulk-$$.json
jq -c '.shipments[0] | {shipmentNo, duplicate}' /tmp/bulk-out-$$.json; rm /tmp/bulk-$$.json /tmp/bulk-out-$$.json
sql "select count(*) as units from units where serial_number like 'BULK-%'; select count(*) as dispatched from unit_events e join units u on u.id=e.unit_id where u.serial_number like 'BULK-%';"
```

관찰:

```
http 201
{"shipmentNo":"PO-2026-000001-R4","duplicate":false}
units
5000
dispatched
5000
```

## 관찰할 것

- 단계 11 의 `CAM-0001` 두 번째 `DISPATCHED`: 다른 선적에 있는 시리얼도 사실을 남기므로(거부하지 않는다) 이력에 `IN_TRANSIT 상태에서 올 수 없는 사실` 이상이 붙는다.
- 입고 스캔(`RECEIVED`)이나 출고 스캔(`SHIPPED`)이 개체의 첫 사실이면 지금은 `UNKNOWN 상태에서 올 수 없는 사실` 이상이 붙는다 (`projectUnit` 을 직접 불러 확인했다: `RECEIVED`·`STORED`·`SHIPPED` 모두 이상 한 줄, `DISPATCHED` 는 없음). 이 PR 에서는 바꾸지 않았다.
