# transport 플레이북

준비와 변수(`SCM`, `post`, `get`)는 [README.md](README.md). scm-api 와 MySQL 이 있으면 된다. `jq` 를 쓴다. Redis 는 단계 26(아웃박스가 비는 시간)에만 필요하고, 나머지는 `REDIS_URL=` 을 비워 띄워도 된다.
규격: `packages/contracts/src/transport.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`. 규칙: [../02-domain-model.md](../02-domain-model.md) "선적".
화면은 [web-console.md](web-console.md) 의 선적 단계.

이 플레이북은 **빈 DB** 에서 처음부터 돌린 값이다 (서브에이전트 구성: 포트 3951, DB `lh_scm_void`, `REDIS_URL=redis://localhost:6379/13`, `DEVICE_API_URL=http://localhost:3999`). 발주 번호는 허브가 채번하므로 다른 데이터가 있으면 번호가 다르다.
`DEVICE_API_URL` 은 아무것도 떠 있지 않은 주소로 둔다: 단계 24 가 만드는 기기 요청의 알림이 다른 사람의 모의 기기 서버로 가지 않게 하기 위해서다(알림은 실패하고 요청은 `NOT_NOTIFIED` 로 남는다).
아래 "관찰" 블록은 실제 응답이고, 매번 달라지는 값만 바꿨다: `UNLINKED-<id>`(연결되지 않은 선적의 번호), `<uuid>`, `<시각>`. 단계 2·5·7·8·22 에서 받은 번호를 변수(`PO1`…`PO6`, `UNL`, `UNL2`)에 담아 뒤 단계에서 쓴다.
DB 를 보는 단계는 다음 함수를 쓴다 (컨테이너 이름은 환경에 맞춘다):

```sh
sql() { docker exec logistics-hub-mysql-1 mysql --default-character-set=utf8mb4 -uroot -proot lh_scm_void -e "$1" 2>&1 | grep -v 'Using a password'; }
```

선적은 업체가 보고한 사실이라 **거부하지 않고 기록한다.** 거절은 마스터 데이터에 없는 SKU 뿐이다. 이상은 응답과 조회에 `anomalies` 로 실린다 (코드: `ShipmentAnomalyCode`).
단계 4–8 은 제출, 9–11 은 조회, 12–14 는 운영자의 연결 명령, 15 는 선적 단위 제품 등록, 16–17 은 동시성과 대량이다.
단계 18–26 은 선적의 정정(무효화)이다: 18 거절, 19–20 무효화(연결 전 번호의 사실 포함), 21 무효화 뒤의 거절, 22 재제출, 23 이미 정정된 사실, 24 기기 요청, 25 동시 요청, 26 대량 5,000개.

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
get $SCM/shipments | head -1 | jq -c '.[] | {shipmentNo, poNumber, reportedPoNumber, lineCount, totalQty, serialCount, anomalyCount, voided}'
curl -s "$SCM/shipments?poNumber=PO-2026-000001" | jq -c '.[] | {shipmentNo, poNumber, anomalyCount}'
curl -s "$SCM/shipments?unlinked=true" | jq -c '.[] | {shipmentNo, reportedPoNumber, anomalyCount}'
get "$SCM/shipments?poNumber=PO-NOPE"
get $SCM/shipments/PO-2026-000001-R2
```

관찰:

```
{"shipmentNo":"PO-2026-000004-R1","poNumber":"PO-2026-000004","reportedPoNumber":"PO-2026-000004","lineCount":2,"totalQty":2,"serialCount":1,"anomalyCount":2,"voided":false}
{"shipmentNo":"UNLINKED-<id>","poNumber":null,"reportedPoNumber":"PO-2026-000002","lineCount":2,"totalQty":3,"serialCount":3,"anomalyCount":4,"voided":false}
{"shipmentNo":"UNLINKED-<id>","poNumber":null,"reportedPoNumber":"PO-2026-999999","lineCount":1,"totalQty":1,"serialCount":1,"anomalyCount":1,"voided":false}
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","lineCount":1,"totalQty":3,"serialCount":2,"anomalyCount":2,"voided":false}
{"shipmentNo":"PO-2026-000001-R1","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","lineCount":2,"totalQty":22,"serialCount":2,"anomalyCount":0,"voided":false}
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","anomalyCount":2}
{"shipmentNo":"PO-2026-000001-R1","poNumber":"PO-2026-000001","anomalyCount":0}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-000002","anomalyCount":4}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-999999","anomalyCount":1}
[]
→ 200
{"shipmentNo":"PO-2026-000001-R2","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-000001","blNumber":"BL-A2","invoiceNumber":null,"shipper":"ACME Shenzhen","mode":"AIR","shipDate":"2026-10-03","eta":null,"source":{"system":"acme-portal","ref":"sub-2"},"reportedAt":"<시각>","recordedAt":"<시각>","lineCount":1,"totalQty":3,"serialCount":2,"anomalyCount":2,"voided":false,"note":null,"lines":[{"lineNo":1,"sku":"CAM-01","quantity":3,"lotNo":null,"poLineNo":1,"serialCount":2}],"anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 5 이(가) 주문 4 + 과납 허용을 넘음"},{"code":"SERIAL_COUNT_MISMATCH","lineNo":1,"message":"CAM-01 시리얼 2개, 수량 3"}],"link":null,"voidRecord":null}
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
{"shipmentNo":"PO-2026-000001-R3","poNumber":"PO-2026-000001","reportedPoNumber":"PO-2026-999999","blNumber":"BL-X1","invoiceNumber":null,"shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-02","eta":null,"source":{"system":"acme-portal","ref":"sub-3"},"reportedAt":"<시각>","recordedAt":"<시각>","lineCount":1,"totalQty":1,"serialCount":1,"anomalyCount":1,"voided":false,"note":null,"lines":[{"lineNo":1,"sku":"CAM-01","quantity":1,"lotNo":null,"poLineNo":1,"serialCount":1}],"anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 6 이(가) 주문 4 + 과납 허용을 넘음"}],"link":{"previousShipmentNo":"UNLINKED-<id>","poNumber":"PO-2026-000001","actor":"op-1","reason":"제조사가 발주 번호를 잘못 적음","linkedAt":"<시각>","anomalies":[{"code":"OVER_SHIPPED","lineNo":1,"message":"발주 줄 1 (CAM-01) 선적 누계 6 이(가) 주문 4 + 과납 허용을 넘음"}]},"voidRecord":null}
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
curl -s -o /tmp/bulk-out-$$.json -w 'http %{http_code} 응답 %{time_total}s\n' -X POST $SCM/shipments/intake -H 'content-type: application/json' --data-binary @/tmp/bulk-$$.json
jq -c '.shipments[0] | {shipmentNo, duplicate}' /tmp/bulk-out-$$.json; rm /tmp/bulk-$$.json /tmp/bulk-out-$$.json
sql "select count(*) as units from units where serial_number like 'BULK-%'; select count(*) as dispatched from unit_events e join units u on u.id=e.unit_id where u.serial_number like 'BULK-%';"
```

관찰:

```
http 201 응답 2.433903s
{"shipmentNo":"PO-2026-000001-R4","duplicate":false}
units
5000
dispatched
5000
```

### 18. 무효화 명령의 거절

선적의 정정은 줄 단위가 아니라 **선적 전체를 무효화**하고 다시 제출하는 것이다. 우리가 내리는 명령이라 전제가 맞지 않으면 거절한다. 거절은 아무것도 바꾸지 않는다.

```sh
post $SCM/shipments/NOPE/void '{"actor":"op-1","reason":"x"}'
post $SCM/shipments/$UNL2/void '{"actor":"op-1"}'
post $SCM/shipments/$UNL2/void "{\"actor\":\"op-1\",\"reason\":\"$(printf 'x%.0s' $(seq 1 401))\"}" | cut -c1-200
sql "select count(*) as shipment_corrections from shipment_corrections; select count(*) as unit_event_corrections from unit_event_corrections;"
```

관찰:

```
{"code":"SHIPMENT_NOT_FOUND","message":"Unknown shipment NOPE"}
→ 404
{"code":"VALIDATION_FAILED","details":[{"path":"reason","message":"Invalid input: expected string, received undefined"}]}
→ 400
{"code":"VALIDATION_FAILED","details":[{"path":"reason","message":"Too big: expected string to have <=400 characters"}]}
→ 400
shipment_corrections
0
unit_event_corrections
0
```

### 19. 연결 전 번호의 선적(`$UNL2`) 무효화: 다른 선적에도 있는 시리얼

`$UNL2`(단계 7)는 `CAM-0001` 을 `PO-2026-000001-R1` 과 겹쳐 싣고 있다. 무효화하면 `$UNL2` 가 만든 `DISPATCHED`(출처 참조 `UNLINKED-…`)만 정정되고 `R1` 의 것은 남는다. 사실은 지워지지 않고 정정 기록이 붙으며, 개체를 다시 접어 상태가 맞춰진다(두 번째 출발 때문에 붙었던 이상이 사라진다). `MIX-1`(다른 SKU 라 이력을 남기지 않았다)은 그대로다. 시리얼마다 `scm.unit.event-voided` 가 아웃박스에 하나씩 적힌다.

```sh
get $SCM/units/CAM-0001 | head -1 | jq -c '{status, anomalies, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
sql "select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided';"
post $SCM/shipments/$UNL2/void '{"actor":"op-1","reason":"제조사가 시리얼 목록을 잘못 보냄"}'
get $SCM/units/CAM-0001 | head -1 | jq -c '{status, anomalies, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
get $SCM/units/CAM-0001 | head -1 | jq -c '.events[] | select(.correction != null) | .correction'
get $SCM/units/MIX-1 | head -1 | jq -c '{status, events: [.events[].type]}'
curl -s "$SCM/shipments?unlinked=true" | jq -c --arg n "$UNL2" '.[] | select(.shipmentNo == $n) | {shipmentNo, reportedPoNumber, voided}'
sql "select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided'; select o.\`key\`, o.payload->>'\$.payload.eventType' as event_type, o.payload->>'\$.payload.reason' as reason, o.payload->>'\$.payload.replacementEventId' as replacement from outbox_events o where o.payload->>'\$.type' = 'scm.unit.event-voided';"
sql "select s.shipment_no, c.actor, c.reason from shipment_corrections c join shipments s on s.id = c.shipment_id; select count(*) as unit_event_corrections from unit_event_corrections;"
```

관찰:

```
{"status":"IN_STOCK","anomalies":["<시각> DISPATCHED: IN_TRANSIT 상태에서 올 수 없는 사실"],"events":[{"type":"DISPATCHED","ref":"PO-2026-000001-R1","corrected":false},{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":false},{"type":"REGISTERED","ref":"op-1","corrected":false},{"type":"RECEIVED","ref":null,"corrected":false}]}
event_voided_rows
0
{"shipment":{"shipmentNo":"UNLINKED-<id>","poNumber":null,"reportedPoNumber":"PO-2026-000002","blNumber":"BL-M1","invoiceNumber":null,"shipper":"ACME Shenzhen","mode":"ROAD","shipDate":null,"eta":null,"source":{"system":"acme-portal","ref":null},"reportedAt":"<시각>","recordedAt":"<시각>","lineCount":2,"totalQty":3,"serialCount":3,"anomalyCount":4,"voided":true,"note":null,"lines":[{"lineNo":1,"sku":"CAM-01","quantity":2,"lotNo":null,"poLineNo":null,"serialCount":2},{"lineNo":2,"sku":"LENS-01","quantity":1,"lotNo":null,"poLineNo":null,"serialCount":1}],"anomalies":[{"code":"PO_UNLINKED","lineNo":null,"message":"발주 PO-2026-000002 가 DRAFT 상태라 연결하지 못함 (ISSUED 아님)"},{"code":"DUPLICATE_SERIAL","lineNo":1,"message":"다른 선적에 이미 있는 시리얼: CAM-0001"},{"code":"SERIAL_SKU_CONFLICT","lineNo":1,"message":"이미 다른 SKU 로 등록된 시리얼 (CAM-01 가 아님): MIX-1. 이력을 남기지 않음"},{"code":"SERIALS_ON_UNTRACKED_PRODUCT","lineNo":2,"message":"LENS-01 은(는) 시리얼 추적 제품이 아닌데 시리얼 1개가 옴 (개체는 만들지 않음)"}],"link":null,"voidRecord":{"actor":"op-1","reason":"제조사가 시리얼 목록을 잘못 보냄","voidedAt":"<시각>"}},"voidedEvents":1,"skippedEvents":0,"deviceRequestIds":[]}
→ 201
{"status":"IN_STOCK","anomalies":[],"events":[{"type":"DISPATCHED","ref":"PO-2026-000001-R1","corrected":false},{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":true},{"type":"REGISTERED","ref":"op-1","corrected":false},{"type":"RECEIVED","ref":null,"corrected":false}]}
{"id":"<uuid>","reason":"선적 UNLINKED-<id> 무효화: 제조사가 시리얼 목록을 잘못 보냄","actor":"op-1","recordedAt":"<시각>","replacementEventId":null}
{"status":"PRODUCED","events":["MANUFACTURED"]}
{"shipmentNo":"UNLINKED-<id>","reportedPoNumber":"PO-2026-000002","voided":true}
event_voided_rows
1
key	event_type	reason	replacement
CAM-0001	DISPATCHED	선적 UNLINKED-<id> 무효화: 제조사가 시리얼 목록을 잘못 보냄	null
shipment_no	actor	reason
UNLINKED-<id>	op-1	제조사가 시리얼 목록을 잘못 보냄
unit_event_corrections
1
```

응답 `voidedEvents` 1(`CAM-0001`), `skippedEvents` 0, `deviceRequestIds` 빈 목록. 정정 사유에는 선적 번호가 붙는다(`선적 <번호> 무효화: <사유>`).

### 20. 연결된 선적(`PO-2026-000001-R3`) 무효화: 연결 전 번호로 남은 사실

`R3` 는 단계 13 에서 `$UNL` 을 연결한 선적이다. 그 선적이 만든 `CAM-0005` 의 `DISPATCHED` 는 출처 참조가 **연결 전 번호**(`UNLINKED-…`)로 남아 있다. 지금 번호(`R3`)로 무효화해도 연결 기록(`shipment_links.previous_shipment_no`)으로 그 사실을 찾아 정정한다. 발주 줄의 선적 수량 누계에서 `R3` 의 1이 빠진다.

```sh
get $SCM/purchase-orders/$PO1 | head -1 | jq -c '.lines[0] | {lineNo, sku, orderedQty, shippedQty}'
get $SCM/units/CAM-0005 | head -1 | jq -c '{status, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
sql "select previous_shipment_no, shipment_no from shipment_links;"
curl -s -X POST $SCM/shipments/PO-2026-000001-R3/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"BL-X1 은 다른 거래처 선적임"}' | jq -c '{voidedEvents, skippedEvents, deviceRequestIds, shipmentNo: .shipment.shipmentNo, voided: .shipment.voided, voidRecord: .shipment.voidRecord}'
get $SCM/purchase-orders/$PO1 | head -1 | jq -c '.lines[0] | {lineNo, sku, orderedQty, shippedQty}'
get $SCM/units/CAM-0005 | head -1 | jq -c '{status, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
sql "select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided';"
```

관찰:

```
{"lineNo":1,"sku":"CAM-01","orderedQty":4,"shippedQty":5006}
{"status":"IN_TRANSIT","events":[{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":false}]}
previous_shipment_no	shipment_no
UNLINKED-<id>	PO-2026-000001-R3
{"voidedEvents":1,"skippedEvents":0,"deviceRequestIds":[],"shipmentNo":"PO-2026-000001-R3","voided":true,"voidRecord":{"actor":"op-1","reason":"BL-X1 은 다른 거래처 선적임","voidedAt":"<시각>"}}
{"lineNo":1,"sku":"CAM-01","orderedQty":4,"shippedQty":5005}
{"status":"UNKNOWN","events":[{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":true}]}
event_voided_rows
2
```

`shippedQty` 에는 단계 17 의 5,000개도 들어 있다.

### 21. 무효화 뒤의 거절: 다시 무효화, 연결, 제품 등록

무효화는 한 번뿐이고, 무효 선적은 연결 명령과 선적 단위 제품 등록을 받지 않는다. 이미 연결된 `R3` 를 연결하려는 경우도 `SHIPMENT_ALREADY_LINKED` 가 아니라 무효 선적으로 거절한다. 조회는 그대로 된다.

```sh
post $SCM/shipments/PO-2026-000001-R3/void '{"actor":"op-1","reason":"한 번 더"}'
post $SCM/shipments/$UNL2/link "{\"poNumber\":\"$PO1\",\"actor\":\"op-1\",\"reason\":\"x\"}"
post $SCM/shipments/PO-2026-000001-R3/link "{\"poNumber\":\"$PO1\",\"actor\":\"op-1\",\"reason\":\"x\"}"
post $SCM/unit-registrations "{\"shipmentNo\":\"$UNL2\",\"actor\":\"op-1\"}"
post $SCM/unit-registrations '{"shipmentNo":"PO-2026-000001-R3","actor":"op-1"}'
get $SCM/shipments/$UNL | head -1 | jq -c '{shipmentNo, voided}'
sql "select count(*) as shipment_corrections from shipment_corrections; select count(*) as unit_event_corrections from unit_event_corrections; select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided';"
```

관찰:

```
{"code":"SHIPMENT_ALREADY_VOIDED","message":"Shipment PO-2026-000001-R3 is already voided"}
→ 409
{"code":"SHIPMENT_ALREADY_VOIDED","message":"Shipment UNLINKED-<id> is voided and cannot be linked"}
→ 409
{"code":"SHIPMENT_ALREADY_VOIDED","message":"Shipment PO-2026-000001-R3 is voided and cannot be linked"}
→ 409
{"code":"SHIPMENT_ALREADY_VOIDED","message":"Shipment UNLINKED-<id> is voided"}
→ 409
{"code":"SHIPMENT_ALREADY_VOIDED","message":"Shipment PO-2026-000001-R3 is voided"}
→ 409
{"shipmentNo":"PO-2026-000001-R3","voided":true}
shipment_corrections
2
unit_event_corrections
2
event_voided_rows
2
```

거절은 아무것도 바꾸지 않는다(무효화 기록 2, 정정 기록 2, `event-voided` 2 그대로). 연결 전 번호(`$UNL`)로도 무효 선적이 조회된다.

### 22. 재제출: 무효 선적은 누계와 알려진 시리얼에서 빠지고 새 차수를 받는다

주문 2개짜리 발주 `PO5` 에 시리얼 `RS-1`, `RS-2` 를 제출하고 무효화한 뒤 같은 시리얼로 다시 제출한다. 무효 선적이 누계(2)와 시리얼을 잡고 있으면 `OVER_SHIPPED`·`DUPLICATE_SERIAL` 이 붙는다. 번호는 `R1` 을 다시 쓰지 않고 `R2` 다. 대조로 한 번 더 제출하면(`R3`) 무효화하지 않은 `R2` 와는 겹쳐서 두 이상이 붙는다.

```sh
mk() { curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d "$1" | jq -r .poNumber; }
PO5=$(mk '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":2,"requestedDeliveryDate":"2026-11-15"}]}')
echo "PO5=$PO5"
post $SCM/purchase-orders/$PO5/issue '{"actor":"buyer-1"}' | tail -1
RS='{"shipments":[{"poNumber":"'$PO5'","blNumber":"BL-RS","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-06","lines":[{"sku":"CAM-01","quantity":2,"serialNumbers":["RS-1","RS-2"]}],"source":{"system":"acme-portal"}}]}'
post $SCM/shipments/intake "$RS"
get $SCM/purchase-orders/$PO5 | head -1 | jq -c '.lines[0] | {orderedQty, shippedQty}'
curl -s -X POST $SCM/shipments/$PO5-R1/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"시리얼 목록을 다시 받기로 함"}' | jq -c '{voidedEvents, skippedEvents, shipmentNo: .shipment.shipmentNo, voided: .shipment.voided}'
get $SCM/purchase-orders/$PO5 | head -1 | jq -c '.lines[0] | {orderedQty, shippedQty}'
get $SCM/units/RS-2 | head -1 | jq -c '{status, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
post $SCM/shipments/intake "$RS"
get $SCM/units/RS-2 | head -1 | jq -c '{status, anomalies, events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
get $SCM/purchase-orders/$PO5 | head -1 | jq -c '.lines[0] | {orderedQty, shippedQty}'
curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d "$RS" | jq -c '.shipments[0] | {shipmentNo, anomalies: [.anomalies[].code]}'
sql "select shipment_no, (select count(*) from shipment_corrections c where c.shipment_id = s.id) as voided from shipments s where purchase_order_id = (select id from purchase_orders where po_number='$PO5') order by id;"
```

관찰:

```
PO5=PO-2026-000005
→ 201
{"shipments":[{"shipmentNo":"PO-2026-000005-R1","duplicate":false,"poNumber":"PO-2026-000005","anomalies":[]}]}
→ 201
{"orderedQty":2,"shippedQty":2}
{"voidedEvents":2,"skippedEvents":0,"shipmentNo":"PO-2026-000005-R1","voided":true}
{"orderedQty":2,"shippedQty":0}
{"status":"UNKNOWN","events":[{"type":"DISPATCHED","ref":"PO-2026-000005-R1","corrected":true}]}
{"shipments":[{"shipmentNo":"PO-2026-000005-R2","duplicate":false,"poNumber":"PO-2026-000005","anomalies":[]}]}
→ 201
{"status":"IN_TRANSIT","anomalies":[],"events":[{"type":"DISPATCHED","ref":"PO-2026-000005-R1","corrected":true},{"type":"DISPATCHED","ref":"PO-2026-000005-R2","corrected":false}]}
{"orderedQty":2,"shippedQty":2}
{"shipmentNo":"PO-2026-000005-R3","anomalies":["OVER_SHIPPED","DUPLICATE_SERIAL"]}
shipment_no	voided
PO-2026-000005-R1	1
PO-2026-000005-R2	0
PO-2026-000005-R3	0
```

### 23. 이미 정정된 사실은 건너뛴다

운영자가 `SK-1` 의 출발 사실을 먼저 따로 정정해 두었다(`POST /unit-events/:id/corrections`). 그 선적을 무효화하면 이미 정정된 사실은 건너뛰고(`skippedEvents` 1) 나머지만 정정한다. 건너뛴 사실은 `event-voided` 를 다시 내지 않는다: `SK-1`·`SK-2` 합쳐 2건이다(`SK-1` 은 먼저 한 정정이, `SK-2` 는 이 무효화가 낸 것).

```sh
OUT=$(curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"PO-NONE","blNumber":"BL-SK","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-06","lines":[{"sku":"CAM-01","quantity":2,"serialNumbers":["SK-1","SK-2"]}],"source":{"system":"acme-portal"}}]}')
SK=$(echo "$OUT" | jq -r '.shipments[0].shipmentNo'); echo "SK=$SK"
EV=$(curl -s $SCM/units/SK-1 | jq -r '.events[0].id')
post $SCM/unit-events/$EV/corrections '{"actor":"op-2","reason":"SK-1 은 아직 출발 전이었음"}'
curl -s -X POST $SCM/shipments/$SK/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"선적 전체가 잘못 보고됨"}' | jq -c '{voidedEvents, skippedEvents, deviceRequestIds, shipmentNo: .shipment.shipmentNo, voided: .shipment.voided}'
get $SCM/units/SK-1 | head -1 | jq -c '{status, events: [.events[] | {type, corrected: (.correction != null), reason: .correction.reason}]}'
get $SCM/units/SK-2 | head -1 | jq -c '{status, events: [.events[] | {type, corrected: (.correction != null), reason: .correction.reason}]}'
sql "select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided' and \`key\` in ('SK-1','SK-2');"
```

관찰:

```
SK=UNLINKED-<id>
{"correctionId":"<uuid>","replacementEventId":null}
→ 201
{"voidedEvents":1,"skippedEvents":1,"deviceRequestIds":[],"shipmentNo":"UNLINKED-<id>","voided":true}
{"status":"UNKNOWN","events":[{"type":"DISPATCHED","corrected":true,"reason":"SK-1 은 아직 출발 전이었음"}]}
{"status":"UNKNOWN","events":[{"type":"DISPATCHED","corrected":true,"reason":"선적 UNLINKED-<id> 무효화: 선적 전체가 잘못 보고됨"}]}
event_voided_rows
2
```

### 24. 활성 여부가 바뀌는 무효화: 기기 요청

등록된 개체가 폐기된 뒤(`SCRAPPED`) 다시 출발했다고 보고한 선적을 입고하면 개체가 다시 활성이 되어 `REGISTER` 요청이 생긴다(`shipment-intake`). 그 선적을 무효화하면 상태가 `SCRAPPED` 로 돌아가 활성이 아니게 되므로 **기기 요청 `DEACTIVATE` 가 무효화 한 번에 하나** 생긴다. 사유는 `SHIPMENT_VOIDED` 다(`DISPATCHED` 로 읽히면 "출발 때문에 비활성화"로 오해된다).

```sh
curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"PO-NONE","blNumber":"BL-D1","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-01","lines":[{"sku":"CAM-01","quantity":1,"serialNumbers":["DEA-1"]}],"source":{"system":"acme-portal"}}]}' | jq -c '.shipments[0] | {shipmentNo, anomalies: [.anomalies[].code]}'
post $SCM/unit-events '{"serialNumber":"DEA-1","type":"RECEIVED","occurredAt":"2026-10-02T00:00:00Z","locationCode":"WH-ICN","source":{"system":"3PL B"}}'
post $SCM/unit-registrations '{"serialNumbers":["DEA-1"],"actor":"op-1"}'
post $SCM/unit-events '{"serialNumber":"DEA-1","type":"SCRAPPED","occurredAt":"2026-10-03T00:00:00Z","source":{"system":"3PL B"}}'
OUT=$(curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"PO-NONE","blNumber":"BL-D2","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-20","lines":[{"sku":"CAM-01","quantity":1,"serialNumbers":["DEA-1"]}],"source":{"system":"acme-portal"}}]}')
echo "$OUT" | jq -c '.shipments[0] | {shipmentNo, anomalies: [.anomalies[].code]}'
D2=$(echo "$OUT" | jq -r '.shipments[0].shipmentNo'); echo "D2=$D2"
get $SCM/units/DEA-1 | head -1 | jq -c '{status, registered: (.registeredAt != null)}'
curl -s $SCM/device-requests | jq -c '.[] | select(.createdBy=="shipment-intake") | {type, reason, createdBy, counts}'
OUT=$(curl -s -X POST $SCM/shipments/$D2/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"BL-D2 는 DEA-1 이 아니라 DEA-2 였음"}')
echo "$OUT" | jq -c '{voidedEvents, skippedEvents, deviceRequestIds, shipmentNo: .shipment.shipmentNo, voided: .shipment.voided}'
RID=$(echo "$OUT" | jq -r '.deviceRequestIds[0]')
curl -s $SCM/device-requests/$RID | jq -c '{type, reason, createdBy, counts}'
get $SCM/units/DEA-1 | head -1 | jq -c '{status, registered: (.registeredAt != null), events: [.events[] | {type, ref: .source.ref, corrected: (.correction != null)}]}'
```

관찰:

```
{"shipmentNo":"UNLINKED-<id>","anomalies":["PO_UNLINKED"]}
{"eventId":"<uuid>","duplicate":false}
→ 201
{"requestId":"<uuid>","registered":["DEA-1"],"excluded":[]}
→ 201
{"eventId":"<uuid>","duplicate":false}
→ 201
{"shipmentNo":"UNLINKED-<id>","anomalies":["PO_UNLINKED","DUPLICATE_SERIAL"]}
D2=UNLINKED-<id>
{"status":"IN_TRANSIT","registered":true}
{"type":"REGISTER","reason":"DISPATCHED","createdBy":"shipment-intake","counts":{"total":1,"pending":1,"succeeded":0,"failed":0}}
{"voidedEvents":1,"skippedEvents":0,"deviceRequestIds":["<uuid>"],"shipmentNo":"UNLINKED-<id>","voided":true}
{"type":"DEACTIVATE","reason":"SHIPMENT_VOIDED","createdBy":"op-1","counts":{"total":1,"pending":1,"succeeded":0,"failed":0}}
{"status":"SCRAPPED","registered":true,"events":[{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":false},{"type":"RECEIVED","ref":null,"corrected":false},{"type":"SCRAPPED","ref":null,"corrected":false},{"type":"REGISTERED","ref":"op-1","corrected":false},{"type":"DISPATCHED","ref":"UNLINKED-<id>","corrected":true}]}
```

### 25. 동시 요청: 같은 선적의 무효화, 무효화와 같은 발주의 새 제출

같은 선적을 동시에 무효화해도 하나만 통과하고 나머지는 409 이며 500 이 나지 않는다. 사실은 한 번만 정정된다(`event-voided` 3건 = 시리얼 3개). 무효화와 같은 발주의 새 제출이 겹쳐도 차수가 겹치지 않고 누계가 맞는다(발주를 먼저 잠그는 순서는 입고와 같다).

```sh
mk() { curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d "$1" | jq -r .poNumber; }
PO6=$(mk '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":10,"requestedDeliveryDate":"2026-11-15"}]}')
post $SCM/purchase-orders/$PO6/issue '{"actor":"buyer-1"}' | tail -1
echo "PO6=$PO6"
curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"'$PO6'","blNumber":"BL-CC","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-06","lines":[{"sku":"CAM-01","quantity":3,"serialNumbers":["CC-1","CC-2","CC-3"]}],"source":{"system":"acme-portal"}}]}' | jq -c '.shipments[0] | {shipmentNo, anomalies: [.anomalies[].code]}'
echo "# (a) 같은 선적을 8건 동시에 무효화"
for i in 1 2 3 4 5 6 7 8; do curl -s -o /dev/null -w '%{http_code} ' -X POST $SCM/shipments/$PO6-R1/void -H 'content-type: application/json' -d '{"actor":"op-'$i'","reason":"동시 무효화"}' & done; wait; echo
sql "select count(*) as shipment_corrections from shipment_corrections c join shipments s on s.id = c.shipment_id where s.shipment_no = '$PO6-R1'; select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided' and \`key\` like 'CC-%';"
echo "# (b) 무효화와 같은 발주의 새 제출이 동시에"
curl -s -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"'$PO6'","blNumber":"BL-CC2","shipper":"ACME Shenzhen","mode":"SEA","shipDate":"2026-10-06","lines":[{"sku":"CAM-01","quantity":3,"serialNumbers":["CD-1","CD-2","CD-3"]}],"source":{"system":"acme-portal"}}]}' | jq -c '.shipments[0] | {shipmentNo}'
for i in 1 2 3 4; do curl -s -o /dev/null -w 'intake %{http_code} ' -X POST $SCM/shipments/intake -H 'content-type: application/json' -d '{"shipments":[{"poNumber":"'$PO6'","blNumber":"BL-N'$i'","shipper":"ACME Shenzhen","mode":"SEA","lines":[{"sku":"CAM-01","quantity":1,"serialNumbers":["CN-'$i'"]}],"source":{"system":"acme-portal"}}]}' & done
curl -s -o /dev/null -w 'void %{http_code} ' -X POST $SCM/shipments/$PO6-R2/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"동시 제출과 경합"}' &
wait; echo
sql "select shipment_no, (select count(*) from shipment_corrections c where c.shipment_id = s.id) as voided from shipments s where purchase_order_id = (select id from purchase_orders where po_number='$PO6') order by id;"
get $SCM/purchase-orders/$PO6 | head -1 | jq -c '.lines[0] | {orderedQty, shippedQty}'
```

관찰:

```
→ 201
PO6=PO-2026-000006
{"shipmentNo":"PO-2026-000006-R1","anomalies":[]}
# (a) 같은 선적을 8건 동시에 무효화
201 409 409 409 409 409 409 409
shipment_corrections
1
event_voided_rows
3
# (b) 무효화와 같은 발주의 새 제출이 동시에
{"shipmentNo":"PO-2026-000006-R2"}
intake 201 intake 201 intake 201 intake 201 void 201
shipment_no	voided
PO-2026-000006-R1	1
PO-2026-000006-R2	1
PO-2026-000006-R3	0
PO-2026-000006-R4	0
PO-2026-000006-R5	0
PO-2026-000006-R6	0
{"orderedQty":10,"shippedQty":4}
```

### 26. 대량: 시리얼 5000개 선적의 입고와 무효화

무효화는 입고(`recordAll`)와 같은 크기의 대량 경로다: 정정 기록을 묶음으로 넣고 시리얼마다 `event-voided` 를 아웃박스에 적는다. 같은 크기의 입고와 무효화에 걸린 시간(HTTP 응답, 아웃박스 미발행 행이 0이 될 때까지)을 나란히 잰다. 이 단계는 Redis 가 있어야 아웃박스가 빈다. 시간은 환경마다 다르다: 아래는 이 구성에서 한 번 잰 값이다.

```sh
now() { python3 -c 'import time; print(time.time())'; }
unpublished() { sql "select count(*) from outbox_events where published_at is null" | tail -1; }
drain() { while [ "$(unpublished)" != "0" ]; do sleep 0.2; done; python3 -c "import time; print('outbox 미발행 0 까지 %.1f 초' % (time.time()-$1))"; }
while [ "$(unpublished)" != "0" ]; do sleep 0.2; done   # 앞 단계가 쌓은 행이 먼저 비게 한다
echo "미발행: $(unpublished)"
seq 1 5000 | jq -R -s -c '{shipments:[{poNumber:"PO-NONE",blNumber:"BL-BIG",shipper:"ACME",mode:"SEA",lines:[{sku:"CAM-01",quantity:5000,serialNumbers:(split("\n")|map(select(.!=""))|map("BIG-"+.))}],source:{system:"acme-portal"}}]}' > /tmp/big-$$.json
T0=$(now)
curl -s -o /tmp/big-out-$$.json -w '입고 http %{http_code} 응답 %{time_total}s\n' -X POST $SCM/shipments/intake -H 'content-type: application/json' --data-binary @/tmp/big-$$.json
BIG=$(jq -r '.shipments[0].shipmentNo' /tmp/big-out-$$.json)
echo "입고 직후 미발행: $(unpublished)"
drain $T0
rm /tmp/big-$$.json /tmp/big-out-$$.json
sql "select count(*) as event_recorded_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-recorded' and \`key\` like 'BIG-%';"
T1=$(now)
curl -s -o /tmp/void-out-$$.json -w '무효화 http %{http_code} 응답 %{time_total}s\n' -X POST $SCM/shipments/$BIG/void -H 'content-type: application/json' -d '{"actor":"op-1","reason":"5000개 목록 전체가 잘못됨"}'
jq -c '{voidedEvents, skippedEvents, deviceRequestIds, voided: .shipment.voided}' /tmp/void-out-$$.json; rm /tmp/void-out-$$.json
echo "무효화 직후 미발행: $(unpublished)"
drain $T1
sql "select count(*) as event_voided_rows from outbox_events where payload->>'\$.type' = 'scm.unit.event-voided' and \`key\` like 'BIG-%'; select count(*) as corrections from unit_event_corrections c join unit_events e on e.id = c.target_event_id join units u on u.id = e.unit_id where u.serial_number like 'BIG-%'; select status, count(*) as units from units where serial_number like 'BIG-%' group by status;"
```

관찰:

```
미발행: 0
입고 http 201 응답 2.407923s
입고 직후 미발행: 5000
outbox 미발행 0 까지 3.9 초
event_recorded_rows
5000
무효화 http 201 응답 2.383407s
{"voidedEvents":5000,"skippedEvents":0,"deviceRequestIds":[],"voided":true}
무효화 직후 미발행: 5000
outbox 미발행 0 까지 3.9 초
event_voided_rows
5000
corrections
5000
status	units
UNKNOWN	5000
```

`drain` 의 시간은 입고·무효화 요청을 보낸 시점부터 아웃박스 행 5,000개가 모두 발행될 때까지다(relay 가 `XADD` 를 한 건씩 보낸다). 서비스 간 소비(OMS 가 이 메시지를 받는 시간)는 `cross-service.md` 의 범위다.

## 관찰할 것

- 단계 11 의 `CAM-0001` 두 번째 `DISPATCHED`: 다른 선적에 있는 시리얼도 사실을 남기므로(거부하지 않는다) 이력에 `IN_TRANSIT 상태에서 올 수 없는 사실` 이상이 붙는다.
- 입고 스캔(`RECEIVED`)이나 출고 스캔(`SHIPPED`)이 개체의 첫 사실이면 지금은 `UNKNOWN 상태에서 올 수 없는 사실` 이상이 붙는다 (`projectUnit` 을 직접 불러 확인했다: `RECEIVED`·`STORED`·`SHIPPED` 모두 이상 한 줄, `DISPATCHED` 는 없음). 이 PR 에서는 바꾸지 않았다.
- 단계 19–20: 무효화는 사실을 지우지 않는다. 정정 기록이 붙고(`corrected: true`) 개체를 다시 접어 상태·이상이 맞춰진다. 다른 선적이 같은 시리얼에 남긴 사실(`CAM-0001` 의 `R1`)은 그대로다. 연결된 선적의 사실은 연결 전 번호로 찾는다(`CAM-0005`).
- 단계 21: 무효 선적에 대한 연결 시도는 이미 연결된 선적(`R3`)도 `SHIPMENT_ALREADY_LINKED` 가 아니라 `SHIPMENT_ALREADY_VOIDED` 로 거절한다.
- 단계 22: 무효 선적만 누계와 알려진 시리얼에서 빠진다. 무효화하지 않은 선적과 겹치면(`R3`) 그대로 이상이 붙는다. 차수 번호는 무효 선적도 세어 `R1` 을 다시 쓰지 않는다.
- 단계 26: 시간은 환경마다 다르다. 같은 크기의 입고와 무효화가 같은 자릿수로 나오는지를 본다.
- 입고가 생긴 선적을 무효화할 수 있는지는 정해지지 않았고 이 플레이북은 다루지 않는다(입고 기능이 아직 없다).
