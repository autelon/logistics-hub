# procurement 플레이북

준비와 변수(`SCM`, `post`, `get`)는 [README.md](README.md). scm-api 와 MySQL 만 있으면 된다 (Redis 불필요: `REDIS_URL=` 을 비워 띄워도 된다).
규격: `packages/contracts/src/procurement.ts`. 에러 코드와 상태: `apps/scm-api/src/errors.ts`. 규칙: [../02-domain-model.md](../02-domain-model.md) "발주".
화면은 [web-console.md](web-console.md) 의 발주 단계.

이 플레이북은 **빈 DB** 에서 처음부터 돌린 값이다. 발주 번호는 허브가 채번하므로 다른 데이터가 있으면 번호가 다르다. 아래 `<PO1>` 은 단계 3 에서 받은 번호이고(빈 DB 라면 `PO-2026-000001`) 단계 3 에서 변수 `PO1` 에, 단계 14 에서 `PO2`, 단계 17 에서 `PO3` 에 담아 쓴다.
`PUT` 을 위해 다음 함수를 더 쓴다:

```sh
put() { curl -s -w '\n→ %{http_code}\n' -X PUT "$1" -H 'content-type: application/json' -d "$2"; }
```

받은 수량은 입고·선적이 아직 없어 **항상 0** 이다 (`receivedQty` 0). 그래서 `PO_QTY_BELOW_RECEIVED`, `PO_HAS_RECEIPTS`, `PO_LINE_ALREADY_COMPLETE` 는 HTTP 로 만들 수 없고 단위 테스트(`purchase-order.service.spec.ts`, `purchase-order-revision.spec.ts`, `purchase-order-completion.spec.ts`)로만 확인된다. 5·6단계에서 받은 수량이 생기면 이 플레이북에 단계를 더한다.

## 준비 데이터

### 1. 제품과 거점

```sh
post $SCM/products '{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}'
post $SCM/products '{"sku":"LENS-01","name":"렌즈","trackingMode":"NONE"}'
post $SCM/locations '{"code":"WH-ICN","name":"인천 창고","type":"WAREHOUSE","partner":"3PL B"}'
```

기대: 각각 201 (`{"sku":"CAM-01","name":"카메라","trackingMode":"SERIAL"}`, `{"sku":"LENS-01",…,"trackingMode":"NONE"}`, 거점은 `policy` 가 기본값으로 채워진 본문).

## 작성과 검증

### 2. 거절: 모르는 SKU, 모르는 거점, 빈 줄, 형식 오류

```sh
post $SCM/purchase-orders '{"supplier":"ACME","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"NOPE","orderedQty":1,"requestedDeliveryDate":"2026-11-01"}]}'
post $SCM/purchase-orders '{"supplier":"ACME","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"NOWH","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":1,"requestedDeliveryDate":"2026-11-01"}]}'
post $SCM/purchase-orders '{"supplier":"ACME","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[]}'
post $SCM/purchase-orders '{"supplier":"ACME","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":0,"requestedDeliveryDate":"2026-11-01","underTolerancePct":100}]}'
get $SCM/purchase-orders/PO-2026-999999
```

기대:

```
{"code":"UNKNOWN_SKU","message":"Unknown sku NOPE"}
→ 422
{"code":"UNKNOWN_LOCATION","message":"Unknown location NOWH"}
→ 422
{"code":"VALIDATION_FAILED","details":[{"path":"lines","message":"Too small: expected array to have >=1 items"}]}
→ 400
{"code":"VALIDATION_FAILED","details":[{"path":"lines.0.orderedQty","message":"Too small: expected number to be >=1"},{"path":"lines.0.underTolerancePct","message":"Too big: expected number to be <=99.99"}]}
→ 400
{"code":"PO_NOT_FOUND","message":"Unknown purchase order PO-2026-999999"}
→ 404
```

### 3. 초안 작성

```sh
PO1=$(curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d '{"supplier":"ACME Shenzhen","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","incoterm":"FOB","incotermPlace":"Shenzhen","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":100,"requestedDeliveryDate":"2026-11-15","unitPrice":120.5,"overTolerancePct":5,"underTolerancePct":2.5},{"sku":"LENS-01","orderedQty":50,"requestedDeliveryDate":"2026-11-30"}]}' | jq -r .poNumber); echo $PO1
get $SCM/purchase-orders/$PO1
```

기대 (201 로 만들어지고, 조회는 200):

```
{"poNumber":"PO-2026-000001","supplier":"ACME Shenzhen","orderDate":"2026-10-04","status":"DRAFT","currency":"USD","destinationLocationCode":"WH-ICN","incoterm":"FOB","incotermPlace":"Shenzhen","supplierOrderRef":null,"paymentTerms":null,"remarks":null,"createdAt":"<시각>","createdBy":"buyer-1","issuedAt":null,"issuedBy":null,"lines":[
 {"lineNo":1,"sku":"CAM-01","orderedQty":100,"requestedDeliveryDate":"2026-11-15","unitPrice":120.5,"overTolerancePct":5,"underTolerancePct":2.5,"receivedQty":0,"openQty":100,"completion":"OPEN","closed":false,"closedAt":null,"closedBy":null,"closeReason":null,"cancelled":false},
 {"lineNo":2,"sku":"LENS-01","orderedQty":50,"requestedDeliveryDate":"2026-11-30","unitPrice":null,"overTolerancePct":null,"underTolerancePct":null,"receivedQty":0,"openQty":50,"completion":"OPEN",…}]}
```

### 4. 초안은 자유롭게 고친다 (이력 없음)

```sh
put $SCM/purchase-orders/$PO1 '{"supplier":"ACME Shenzhen Ltd","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","paymentTerms":"T/T 30%","lines":[{"sku":"CAM-01","orderedQty":100,"requestedDeliveryDate":"2026-11-15","unitPrice":120.5,"overTolerancePct":5,"underTolerancePct":2.5},{"sku":"LENS-01","orderedQty":50,"requestedDeliveryDate":"2026-11-30"}]}'
get $SCM/purchase-orders/$PO1/revisions
```

기대: 200, `"supplier":"ACME Shenzhen Ltd"`, `"paymentTerms":"T/T 30%"`, `"incoterm":null` (본문에 없으면 비워진다), 줄 2개 `lineNo` 1·2. 이력 `[]` → 200.

### 5. 발행

```sh
post $SCM/purchase-orders/$PO1/issue '{"actor":"buyer-1"}'
```

기대: 201, `"status":"ISSUED"`, `"issuedAt":"<시각>"`, `"issuedBy":"buyer-1"`.

### 6. 발행된 발주는 초안처럼 못 고친다

```sh
post $SCM/purchase-orders/$PO1/issue '{"actor":"buyer-1"}'
put $SCM/purchase-orders/$PO1 '{"supplier":"X","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","lines":[{"sku":"CAM-01","orderedQty":1,"requestedDeliveryDate":"2026-11-15"}]}'
```

기대:

```
{"code":"PO_NOT_DRAFT","message":"PO-2026-000001 is ISSUED; only a draft can be issued"}
→ 409
{"code":"PO_NOT_DRAFT","message":"PO-2026-000001 is ISSUED; only a draft can be edited"}
→ 409
```

### 7. 목록

```sh
get $SCM/purchase-orders
```

기대: 200, `[{"poNumber":"PO-2026-000001","supplier":"ACME Shenzhen Ltd","orderDate":"2026-10-04","status":"ISSUED","currency":"USD","destinationLocationCode":"WH-ICN","lineCount":2,"orderedQty":150}]` (최근 순, 최대 50건. 취소한 줄은 줄 수와 수량 합에서 빠진다).

## 개정 (발행 뒤)

### 8. 수량·납기 변경, 단가 비우기, 줄 취소, 줄 추가

```sh
post $SCM/purchase-orders/$PO1/revisions '{"reason":"제조사 증량 요청","actor":"buyer-2","changes":{"updateLines":[{"lineNo":1,"orderedQty":120,"requestedDeliveryDate":"2026-12-01","unitPrice":null}],"cancelLines":[2],"addLines":[{"sku":"LENS-01","orderedQty":20,"requestedDeliveryDate":"2026-12-15"}]}}'
```

기대: 201, `lines`:

```
{"lineNo":1,"sku":"CAM-01","orderedQty":120,"requestedDeliveryDate":"2026-12-01","unitPrice":null,"overTolerancePct":5,"underTolerancePct":2.5,"receivedQty":0,"openQty":120,"completion":"OPEN",…,"cancelled":false}
{"lineNo":2,"sku":"LENS-01","orderedQty":50,…,"receivedQty":0,"openQty":0,"completion":"CANCELLED",…,"cancelled":true}
{"lineNo":3,"sku":"LENS-01","orderedQty":20,"requestedDeliveryDate":"2026-12-15",…,"openQty":20,"completion":"OPEN",…}
```

보낸 항목만 바뀐다(허용률은 그대로, `unitPrice` 는 `null` 을 보냈으므로 비워짐). 취소한 줄 번호 2 는 다시 쓰지 않고 새 줄은 3 이다.

### 9. 개정 이력

```sh
get $SCM/purchase-orders/$PO1/revisions
```

기대: 200, 한 건: `actor` `buyer-2`, `reason` `제조사 증량 요청`, `before.lines` 는 줄 1(`orderedQty` 100, `unitPrice` 120.5)과 2(`cancelled` false), `after.lines` 는 줄 1(`orderedQty` 120, `unitPrice` null, 납기 `2026-12-01`)·2(`cancelled` true)·3. 줄마다 `sku` 가 들어 있고 `status` 는 `ISSUED`. (JSON 객체의 키 순서는 MySQL 이 보존하지 않으므로 순서는 비교하지 않는다.)

### 10. 개정 거절

```sh
post $SCM/purchase-orders/$PO1/revisions '{"reason":"r","actor":"a","changes":{"updateLines":[{"lineNo":9,"orderedQty":1}]}}'
post $SCM/purchase-orders/$PO1/revisions '{"reason":"r","actor":"a","changes":{"cancelLines":[2]}}'
post $SCM/purchase-orders/$PO1/revisions '{"reason":"r","actor":"a","changes":{}}'
post $SCM/purchase-orders/$PO1/revisions '{"reason":"r","actor":"a","changes":{"updateLines":[{"lineNo":1,"orderedQty":5}],"cancelLines":[1]}}'
```

기대:

```
{"code":"PO_LINE_NOT_FOUND","message":"Line 9: PO_LINE_NOT_FOUND"}
→ 404
{"code":"PO_LINE_CANCELLED","message":"Line 2: PO_LINE_CANCELLED"}
→ 409
{"code":"VALIDATION_FAILED","details":[{"path":"changes","message":"At least one change is required"}]}
→ 400
{"code":"VALIDATION_FAILED","details":[{"path":"changes","message":"A line can be changed or cancelled only once per revision"}]}
→ 400
```

### 11. 바뀐 것이 없는 개정은 이력을 남기지 않는다

```sh
post $SCM/purchase-orders/$PO1/revisions '{"reason":"변화 없음","actor":"a","changes":{"updateLines":[{"lineNo":1,"orderedQty":120}]}}'
get $SCM/purchase-orders/$PO1/revisions
```

기대: 첫 호출 201 (현재 상태를 돌려줌). 이력은 단계 9 의 한 건 그대로 (`변화 없음` 이 없다).

## 줄 닫기 (미달 납품)

### 12. 덜 온 줄을 닫는다

```sh
post $SCM/purchase-orders/$PO1/lines/1/close '{"reason":"제조사가 100개까지만 공급","actor":"buyer-1"}'
```

기대: 201, 줄 1:

```
{"lineNo":1,"sku":"CAM-01","orderedQty":120,"requestedDeliveryDate":"2026-12-01","unitPrice":null,"overTolerancePct":5,"underTolerancePct":2.5,"receivedQty":0,"openQty":0,"completion":"CLOSED_SHORT","closed":true,"closedAt":"<시각>","closedBy":"buyer-1","closeReason":"제조사가 100개까지만 공급","cancelled":false}
```

`openQty` 가 0 이 된다(더 기다리지 않는다). 줄 3 은 그대로 `OPEN`.

### 13. 닫기 거절

```sh
post $SCM/purchase-orders/$PO1/lines/1/close '{"reason":"again","actor":"buyer-1"}'
post $SCM/purchase-orders/$PO1/lines/2/close '{"reason":"x","actor":"buyer-1"}'
post $SCM/purchase-orders/$PO1/lines/9/close '{"reason":"x","actor":"buyer-1"}'
post $SCM/purchase-orders/$PO1/lines/abc/close '{"reason":"x","actor":"buyer-1"}'
```

기대:

```
{"code":"PO_LINE_ALREADY_CLOSED","message":"Line 1 cannot be closed"}
→ 409
{"code":"PO_LINE_CANCELLED","message":"Line 2 cannot be closed"}
→ 409
{"code":"PO_LINE_NOT_FOUND","message":"Unknown line 9"}
→ 404
{"code":"VALIDATION_FAILED","details":[{"path":"","message":"Invalid input: expected number, received NaN"}]}
→ 400
```

## 취소

### 14. 초안은 발행 전이라 개정·줄 닫기가 안 된다

```sh
PO2=$(curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d '{"supplier":"BETA","orderDate":"2026-10-04","currency":"KRW","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":10,"requestedDeliveryDate":"2026-11-01"}]}' | jq -r .poNumber); echo $PO2
post $SCM/purchase-orders/$PO2/revisions '{"reason":"r","actor":"a","changes":{"cancelLines":[1]}}'
post $SCM/purchase-orders/$PO2/lines/1/close '{"reason":"r","actor":"a"}'
```

기대: `PO-2026-000002`. 이어서

```
{"code":"PO_NOT_ISSUED","message":"PO-2026-000002 is DRAFT; only an issued purchase order can be revised"}
→ 409
{"code":"PO_NOT_ISSUED","message":"PO-2026-000002 is DRAFT; only an issued purchase order can be closed"}
→ 409
```

### 15. 발행된 발주를 취소한다 (개정 이력에 남는다)

```sh
post $SCM/purchase-orders/$PO2/issue '{"actor":"buyer-1"}'
post $SCM/purchase-orders/$PO2/cancel '{"reason":"발주 철회","actor":"buyer-1"}'
get $SCM/purchase-orders/$PO2/revisions
```

기대: 취소 201 `"status":"CANCELLED"`. 취소된 발주의 줄은 더 기다리지 않으므로 줄을 따로 취소하지 않았어도 줄 1 이 `"openQty":0,"completion":"CANCELLED"` 로 계산된다(`"cancelled":false` 는 그대로: 줄 취소 표시는 개정으로 취소한 줄에만). 이력 한 건: `reason` `발주 철회`, `actor` `buyer-1`, `before.status` `ISSUED`, `after.status` `CANCELLED`, 줄은 그대로.

### 16. 취소 뒤

```sh
post $SCM/purchase-orders/$PO2/cancel '{"reason":"again","actor":"buyer-1"}'
post $SCM/purchase-orders/$PO2/revisions '{"reason":"r","actor":"a","changes":{"addLines":[{"sku":"CAM-01","orderedQty":1,"requestedDeliveryDate":"2026-12-01"}]}}'
```

기대:

```
{"code":"PO_ALREADY_CANCELLED","message":"PO-2026-000002 is already cancelled"}
→ 409
{"code":"PO_NOT_ISSUED","message":"PO-2026-000002 is CANCELLED; only an issued purchase order can be revised"}
→ 409
```

### 17. 초안의 취소는 이력을 남기지 않는다

```sh
PO3=$(curl -s -X POST $SCM/purchase-orders -H 'content-type: application/json' -d '{"supplier":"GAMMA","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"buyer-1","lines":[{"sku":"CAM-01","orderedQty":10,"requestedDeliveryDate":"2026-11-01"},{"sku":"LENS-01","orderedQty":4,"requestedDeliveryDate":"2026-11-01"}]}' | jq -r .poNumber); echo $PO3
post $SCM/purchase-orders/$PO3/cancel '{"reason":"초안 폐기","actor":"buyer-1"}'
get $SCM/purchase-orders/$PO3/revisions
```

기대: `PO-2026-000003`, 취소 201 `"status":"CANCELLED"`(두 줄 모두 `completion` `CANCELLED`), 이력 `[]` → 200.

## 동시성과 저장된 값

### 18. 동시에 만들어도 번호가 겹치지 않는다

```sh
BODY='{"supplier":"D","orderDate":"2026-10-04","currency":"USD","destinationLocationCode":"WH-ICN","actor":"b","lines":[{"sku":"CAM-01","orderedQty":10,"requestedDeliveryDate":"2026-11-01"}]}'
post $SCM/purchase-orders "$BODY" | grep -o '"poNumber":"[^"]*"' & post $SCM/purchase-orders "$BODY" | grep -o '"poNumber":"[^"]*"' & wait
```

기대: 두 번호가 서로 다르다 (관찰: `PO-2026-000004`, `PO-2026-000005`).

### 19. 같은 줄을 동시에 닫으면 하나만 된다

단계 18 의 `PO-2026-000004` 를 `PO4` 로 두고 발행한 뒤:

```sh
post $SCM/purchase-orders/$PO4/issue '{"actor":"b"}'
post $SCM/purchase-orders/$PO4/lines/1/close '{"reason":"a","actor":"x"}' | tail -1 & post $SCM/purchase-orders/$PO4/lines/1/close '{"reason":"b","actor":"y"}' | tail -2 & wait
```

기대: 한 쪽은 `→ 201`, 다른 쪽은 `PO_LINE_ALREADY_CLOSED` 와 `→ 409` (발주 행 잠금).

### 20. DB 에 저장된 값

```sh
docker-compose exec -T mysql mysql -uroot -proot --default-character-set=utf8mb4 <db> -e "select po_number,status,order_date,issued_by from purchase_orders order by po_number; select l.line_no,l.ordered_qty,l.unit_price,l.under_tolerance_pct,l.closed,l.close_reason,l.cancelled from purchase_order_lines l join purchase_orders po on po.id=l.purchase_order_id where po.po_number='PO-2026-000001' order by l.line_no; select scope,last from public_id_counters; select count(*) as revisions from purchase_order_revisions"
```

(`<db>` 는 scm-api 가 쓰는 DB: 기본 `lh_scm`, 서브에이전트는 자기 DB. worktree 안에서는 `docker-compose -p logistics-hub exec …`.) 기대:

```
po_number       status     order_date  issued_by
PO-2026-000001  ISSUED     2026-10-04  buyer-1
PO-2026-000002  CANCELLED  2026-10-04  buyer-1
PO-2026-000003  CANCELLED  2026-10-04  NULL
PO-2026-000004  ISSUED     2026-10-04  b
PO-2026-000005  DRAFT      2026-10-04  NULL
line_no  ordered_qty  unit_price  under_tolerance_pct  closed  close_reason                  cancelled
1        120          NULL        2.50                 1       제조사가 100개까지만 공급      0
2        50           NULL        NULL                 0       NULL                          1
3        20           NULL        NULL                 0       NULL                          0
scope     last
PO-2026   5
revisions
2
```

`last` 는 번호를 발급한 횟수이고 개정 이력은 단계 8 과 15 의 두 건이다.
