# 2. 도메인 모델

## 기본 키

- **모든 테이블의 기본 키는 `id` 하나**다. 앱에서 `newId()`(`@repo/db-kit/columns`)로 만든 UUIDv7 이고, 자연 키·복합 키를 기본 키로 쓰지 않는다.
  멱등 기록 테이블(`processed_messages`)도 `id` + `(consumer_group, message_id)` unique 다.
- **사람이 정하는 코드**(`sku`, 거점 `code`, 판매 상품 `code`)는 `unique` 제약이 있는 보통 컬럼이다. 외래 키는 항상 `id` 를 가리킨다
  (`units.product_id`, `units.location_id`, `sellable_components.sellable_id`). API 요청·응답과 이벤트는 코드를 주고받고, 서비스가 조인으로 코드를 붙인다.
- **외부 시스템의 식별자**(채널 주문번호 등)는 출처 컬럼과 함께 저장하고(`channel` + `channel_order_no`) 내부 참조에 쓰지 않는다.
- **밖에 보여 줄 번호가 필요하면 `public_id`** 를 따로 둔다 (`orders` → `ORD-2026-000123`, `service_cases` → `CASE-2026-000045`).
  `<접두사>-<UTC 연도>-<6자리>` 이고, 저장하는 트랜잭션 안에서 `nextPublicId`(`@repo/db-kit/public-id`)가 `public_id_counters` 행을 `FOR UPDATE` 로 잠그고 번호를 올린다.
  같은 연도의 동시 발급은 그 잠금으로 직렬화되고, 최종 보증은 `public_id` 의 unique 인덱스다. 조회 경로(`/orders/:id`)와 이벤트의 참조는 여전히 `id` 다.

## SCM — 제품 이력 원장

### 테이블

| 테이블                     | 내용                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `products`                 | SKU 기준 정보. `sku` 는 unique 코드, `tracking_mode`(SERIAL·LOT·NONE, 기본 SERIAL)      |
| `locations`                | 재고가 있을 수 있는 거점 (공장·창고·서비스센터)과 운영 업체. `code` 는 unique           |
| `location_policies`        | 거점의 능력 프로필 (거점당 한 행, 없어도 된다). 아래 "거점 능력 프로필"                 |
| `location_policy_changes`  | 프로필 변경 이력. 추가만 한다                                                           |
| `units`                    | 물리 제품 한 개. 현재 상태·위치·주문·`registered_at` 은 **이력에서 계산한 캐시**        |
| `unit_events`              | 제품에 일어난 사실. **추가만 한다**                                                     |
| `unit_event_corrections`   | 정정 기록. 어떤 사실을 무효로 하고 무엇으로 대체했는지, 사유, 처리자                    |
| `stock_movements`          | 시리얼 없는(LOT·NONE) 제품의 수량 이동. **추가만 한다**. 아래 "수량 원장"               |
| `device_requests`          | 기기 서버에 보내는 요청(`REGISTER`·`DEACTIVATE`). 상태는 저장하지 않고 계산한다         |
| `device_request_items`     | 요청에 딸린 시리얼과 시리얼별 처리 결과. `(request_id, unit_id)` unique                 |
| `purchase_orders`          | 우리가 제조사에 내는 발주서. `po_number` 는 허브가 채번(`PO-2026-000001`). 아래 "발주"  |
| `purchase_order_lines`     | 발주 줄. `(purchase_order_id, line_no)` unique                                          |
| `purchase_order_revisions` | 발행 뒤 변경의 이력. 변경 전후 전체 스냅샷. 추가만 한다                                 |
| `shipments`                | 제조사·포워더가 보고한 출하(B/L·시리얼 목록 제출). 보고된 값은 추가만 한다. 아래 "선적" |
| `shipment_lines`           | 선적 줄. `(shipment_id, line_no)` unique, `purchase_order_line_id` 는 연결 전엔 null    |
| `shipment_line_serials`    | 선적 줄의 시리얼. `(shipment_line_id, serial_number)` unique                            |
| `shipment_links`           | 운영자가 발주에 연결한 기록. 선적 하나에 하나, 추가만 한다                              |
| `shipment_corrections`     | 선적의 무효화 기록(처리자·사유·시각). 선적 하나에 하나, 추가만 한다                     |

### 사실(unit event)의 종류와 상태 변화

| 사실              | 뜻             | 정상적으로 올 수 있는 상태         | 결과 상태             |
| ----------------- | -------------- | ---------------------------------- | --------------------- |
| `MANUFACTURED`    | 제조 완료      | (처음)                             | `PRODUCED`            |
| `DISPATCHED`      | 거점에서 출발  | (처음), `PRODUCED`, `IN_STOCK`     | `IN_TRANSIT`          |
| `RECEIVED`        | 입고           | `IN_TRANSIT`                       | `IN_STOCK`            |
| `STORED`          | 적재           | `IN_STOCK`                         | `IN_STOCK`            |
| `SHIPPED`         | 주문 출고      | `IN_STOCK`                         | `SHIPPED`             |
| `DELIVERED`       | 배송 완료      | `SHIPPED`                          | `DELIVERED`           |
| `RETURN_RECEIVED` | 회수 입고      | `SHIPPED`, `DELIVERED`, `DOA`      | `RETURNED` (DOA 유지) |
| `DOA_CONFIRMED`   | 초기 불량 확정 | `SHIPPED`, `DELIVERED`, `RETURNED` | `DOA`                 |
| `SCRAPPED`        | 폐기           | `DOA`, `RETURNED`, `IN_STOCK`      | `SCRAPPED`            |

개체의 이력은 처음 시리얼이 보고된 지점에서 시작하므로(06 "정책 변경 지점" 2) `DISPATCHED` 는 `UNKNOWN` 에서도 정상이다(제조사 출하 목록이 첫 사실일 수 있다). 입고 스캔(`RECEIVED`)·출고 스캔(`SHIPPED`)이 첫 사실이면 지금은 `UNKNOWN 상태에서 올 수 없는 사실` 이상이 붙는다(바꾸지 않았다). 샘플 검사의 시리얼 단위 검수 사실은 아직 사실 종류가 없다(6단계).

`REGISTERED`(제품 등록)는 이 표에 없다. 물리 사실이 아니라 **등록 여부라는 다른 축**의 사실이라 상태·거점·이상을 바꾸지 않고 `registeredAt` 만 채운다 ([제품 등록](#제품-등록과-기기-요청)).

표의 "올 수 있는 상태"가 아닌 곳에서 사실이 오면 **반영은 하되 이상으로 표시**한다.
`DISPATCHED`·`SHIPPED`·`DELIVERED`·`SCRAPPED` 는 거점을 비운다. 특히 `DELIVERED` 는 제품이 고객 손에 있다는 뜻이라, 출고가 무효화되어 입고 뒤 배송 완료만 남아도 위치는 비고 재고에는 거점 없이 `DELIVERED` 로 잡힌다. 이후 `RETURN_RECEIVED` 가 오면 회수 거점이 다시 위치가 된다.
`SHIPPED`·`DELIVERED` 가 `registeredAt` 이 비어 있을 때 접히면 `<시각> <사실>: 미등록 개체` 이상을 붙인다. 시리얼 추적 제품(`tracking_mode = SERIAL`)에만 적용되고(`projectUnit` 의 `requiresRegistration`), **자동으로 등록하지 않는다** — 사람이 판단한다. 접는 순서가 `occurredAt` 이라 등록보다 일찍 일어난 것으로 보고된 출고도 이상이다.
규칙은 [unit-projection.ts](../apps/scm-api/src/domains/unit/domain/unit-projection.ts) 한 파일에 있고 순수 함수라 DB 없이 테스트한다.

### 두 개의 시간

- `occurredAt` — 현실에서 일어난 시각 (업체가 알려 준 값)
- `recordedAt` — 우리가 알게 된 시각

상태는 `occurredAt` 순으로 접는다. 보고가 늦게 오거나 순서가 뒤바뀌어 도착해도 결과가 같다.

### 정정

`POST /unit-events/:id/corrections`

- 대상 사실은 무효가 된다 (행은 그대로 남는다).
- `replacement` 를 주면 같은 제품에 대한 올바른 사실이 새로 기록되어 대신 유효해진다.
- 대체 사실도 다시 정정할 수 있다. 한 사실은 한 번만 정정된다.
- 정정 후 제품 상태를 처음부터 다시 계산하고, 다른 서비스에 `event-voided` → `event-recorded` 순으로 알린다.

시리얼을 잘못 찍은 경우(실제로는 다른 제품이 나감)는 "틀린 제품의 출고를 무효화" + "맞는 제품의 출고를 기록" 두 단계다.

### 거점 능력 프로필

거점(창고·서비스센터·공장)마다 "무엇을 보고해 주는가, 무엇을 정하는가"를 값으로 둔다. 파트너와의 계약이나 운영이 바뀌면 코드가 아니라 이 값을 고친다.
각 항목의 뜻과 쓰이는 곳은 [06-inbound-design.md](06-inbound-design.md) "정책 변경 지점". 지금은 값을 저장하고 보여 줄 뿐 아직 읽어서 동작을 바꾸는 코드는 없다.

| 항목                                                                                             | 기본값    |
| ------------------------------------------------------------------------------------------------ | --------- |
| `reportsSerialsOnReceipt` `reportsSerialsOnShipment` `reportsSerialsOnOutbound`                  | 참        |
| `reportsInspectionResult` `decidesDisposition` `requiresHubConfirmation` `autoRegisterOnPutaway` | 거짓      |
| `unitReceiptTrigger` (`GOODS_RECEIPT` / `PUTAWAY`)                                               | `PUTAWAY` |

- **행이 없는 거점은 기본값으로 동작한다.** 거점을 만들 때 행을 만들지 않고, 처음 바꿀 때 모든 값을 채워 만든다. 기본값은 DB 가 아니라 순수 함수 `resolvePolicy` (`location-policy.ts`)가 정한다. 기본값은 오늘의 운영(사용자 확인 2026-10-03)이다.
- `LocationView.policy` 는 해석된 값이라 항상 있다. 변경은 `PUT /locations/:code/policy` (보낸 항목만 바뀐다, `actor` 필수, 하나 이상 필요, 모르는 항목은 거절). 응답은 해석된 프로필이다.
- 변경은 `location_policy_changes` 에 `actor`, 시각, 기본값이 채워진 `before`·`after` 로 남고 `GET /locations/:code/policy/changes` 가 최신순 50건을 돌려준다. 바뀌는 것이 없는 요청은 행도 이력도 만들지 않는다. 같은 거점의 동시 변경은 거점 행을 잠가 직렬화한다.
- 거점을 다시 등록(`POST /locations`)해도 프로필은 그대로다.

### 수량 원장 (`warehouse`)

시리얼이 없는(`tracking_mode` 가 `LOT`·`NONE`) 제품의 재고 근거. 개체 사실(`unit_events`)이 없으므로 수량의 이동을 `stock_movements` 에 추가만 한다.

| 컬럼                                 | 내용                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `product_id`, `lot_no`               | 제품과 로트(없으면 null. `LOT` 제품도 생략할 수 있다)                                               |
| `from_location_id`, `to_location_id` | 한쪽이 비면 입고(출발지 없음) 또는 출고·폐기(도착지 없음). **둘 다 비면 안 된다** (zod 와 DB CHECK) |
| `quantity`, `stock_status`           | 양의 정수(CHECK), `AVAILABLE`·`HOLD`·`QC`. 이동 하나는 재고 상태 하나만 다룬다                      |
| `reason`                             | `GOODS_RECEIPT` `TRANSFER` `SHIPMENT` `SCRAP` `ADJUSTMENT`                                          |
| `occurred_at`, `recorded_at`         | 현실에서 일어난 시각, 우리가 기록한 시각                                                            |
| `source_system`, `source_ref`        | 보고한 업체와 그쪽 참조                                                                             |
| `idempotency_key`                    | unique. 같은 키는 한 번만 기록된다                                                                  |
| `reverses_movement_id`               | unique. 이 이동이 되돌리는 이동. unique 라 이동 하나는 한 번만 되돌릴 수 있다                       |

- **기록은 대량 usecase 다.** `POST /stock-movements { movements (1..1000) }` 가 한 트랜잭션으로 기록하고 항목마다 `{ movementId, duplicate }` 를 요청 순서대로 돌려준다.
  업체 배치 하나를 묶어 받기 위한 입구다 ([06-inbound-design.md](06-inbound-design.md) "업체 연동 방식").
  - 모르는 SKU·거점은 `UNKNOWN_SKU`·`UNKNOWN_LOCATION`(422), 시리얼 제품은 `QUANTITY_TRACKING_ONLY`(422, 시리얼은 개체 사실로만 추적). 하나라도 걸리면 요청 전체를 기록하지 않고 에러 `details.index` 에 첫 번째로 걸린 항목 번호(0부터)를 담는다. 우리가 내리는 명령이 아니라 업체가 보고한 사실이지만, 어느 제품·거점인지 모르면 기록할 수 없어 거절한다.
  - 같은 `idempotencyKey` 는 저장된 이동이든 같은 요청의 앞 항목이든 새로 기록하지 않고 기존 `movementId` 를 `duplicate: true` 로 돌려준다.
  - 같은 키를 **동시에** 보내도 하나만 기록되고 나머지는 `duplicate: true` 로 같은 `movementId` 를 돌려준다 (`POST /unit-events` 도 같다). 진 쪽은 idempotency_key 의 unique 위반(MySQL 1062)으로 트랜잭션이 롤백되고, usecase 가 요청 전체를 처음부터 다시 해서(`retryOnConflict`, 최대 5번) 이긴 쪽이 커밋한 키를 중복으로 알아본다. 다른 unique 인덱스의 위반은 이 경로로 다시 하지 않고 그대로 에러가 된다.
- **정정은 역분개다.** `POST /stock-movements/:id/reversal { reason, actor }` 가 출발지·도착지를 바꾼 `ADJUSTMENT` 이동을 추가한다 (제품·로트·수량·재고 상태는 같다, `reverses_movement_id` 가 원래 이동). 원래 이동은 바뀌지 않는다.
  정정 시각이 `occurred_at`, 출처는 `logistics-hub:correction`(`source_ref` = 처리자), `note` 에 사유와 처리자. 이미 되돌렸으면 `MOVEMENT_ALREADY_REVERSED`(409), 없는 이동은 `MOVEMENT_NOT_FOUND`(404).
  역분개도 이동이라 한 번 되돌릴 수 있다 (원래 효과가 돌아온다). 원래 이동 행을 잠근 뒤 정정 여부를 읽어 동시 정정을 줄 세운다.
- **재고 = 들어온 합 - 나간 합.** 이동 하나는 도착지에 `+수량`, 출발지에 `-수량`이다 (`ledgerEntries`).

### 발주 (`procurement`)

우리가 내는 구매 주문. 업체가 보고한 사실이 아니라 **우리가 만든 문서이고 우리가 내리는 명령**이라, 전제가 맞지 않으면 에러 코드로 거절한다(`PO_*`, `UNKNOWN_SKU`, `UNKNOWN_LOCATION`). 설계 근거와 남은 구현은 [06-inbound-design.md](06-inbound-design.md).

| 항목             | 규칙                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상태             | `DRAFT` → `ISSUED` → (`CANCELLED`). 초안은 `PUT` 으로 자유롭게 고치고 이력을 남기지 않는다. 발행 뒤의 변경은 개정(`revisions`)으로만 하고 변경 전후 전체가 이력에 남는다                                                        |
| 번호             | `po_number` 는 repository 가 저장할 때 `nextPublicId` 로 채번한다 (`PO-<UTC 연도>-<6자리>`)                                                                                                                                     |
| 날짜             | 발주일과 요청 납기는 달력 날짜(`YYYY-MM-DD`)다. 시각이 아니다                                                                                                                                                                   |
| 줄               | 제품은 `product_id` 로 참조한다. 줄 번호는 배열 순서대로 1부터 붙고 취소한 줄 것도 다시 쓰지 않는다. 취소한 줄은 `cancelled` 로 남는다                                                                                          |
| 줄 완료          | **저장하지 않고 계산한다** (`purchase-order-completion.ts`). 받은 누계가 `주문×(1+과납 허용)` 초과면 `OVER`, `주문×(1−미납 허용)` 이상이면 `COMPLETE`, 덜 왔는데 닫았으면 `CLOSED_SHORT`, 아니면 `OPEN`. 허용률이 비어 있으면 0 |
| 줄 닫기          | `closed` 는 "더 안 들어온다"는 미달 납품 선언이다 (`closed_at/by/reason`). 닫을 수 있는 줄은 `OPEN` 뿐이다. 이미 닫은 줄은 `PO_LINE_ALREADY_CLOSED`(409)                                                                        |
| 개정             | 줄의 수량·납기·단가·허용률 변경, 줄 추가, 줄 취소. 주문 수량을 받은 수량 아래로 줄이거나 받은 것이 있는 줄을 취소하면 `PO_QTY_BELOW_RECEIVED`. 바뀐 것이 없으면 이력을 남기지 않는다                                            |
| 취소된 발주의 줄 | 줄을 따로 취소하지 않았어도 진행 상태는 `CANCELLED`(`openQty` 0)로 계산한다                                                                                                                                                     |
| 발주 취소        | 받은 것이 없을 때만 (`PO_HAS_RECEIPTS`; 받은 수량 기준이라 선적만 있는 발주도 취소된다 — 06 확인 18). 발행된 발주의 취소는 개정 이력에 남고, 초안의 취소는 남기지 않는다                                                        |
| 받은 수량        | 입고가 아직 없어 항상 0 이다 (`received-quantity.ts` 임시 구현, 6단계에서 교체). 서비스는 usecase 가 넘기는 조회 함수로 받으므로 도메인끼리 서로를 참조하지 않는다                                                              |
| 선적 수량        | 응답의 `shippedQty` 는 줄에 연결된 선적 줄의 합이다 (`transport`). **완료 계산에는 쓰지 않는다** — 아직 도착하지 않았을 수 있는 수량이라 `receivedQty` 와 따로 보여 준다                                                        |

| 메서드·경로                                                                | 내용                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------ |
| `POST /purchase-orders`                                                    | 초안을 만든다 (SKU·거점이 등록되어 있어야 한다)  |
| `PUT /purchase-orders/:poNumber`                                           | 초안을 통째로 바꾼다 (`PO_NOT_DRAFT`)            |
| `POST /purchase-orders/:poNumber/issue`                                    | 발행 (`PO_NOT_DRAFT`)                            |
| `POST /purchase-orders/:poNumber/revisions`                                | 발행 뒤 개정 (`PO_NOT_ISSUED`)                   |
| `POST /purchase-orders/:poNumber/lines/:lineNo/close`                      | 줄 닫기                                          |
| `POST /purchase-orders/:poNumber/cancel`                                   | 발주 취소                                        |
| `GET /purchase-orders`, `GET .../:poNumber`, `GET .../:poNumber/revisions` | 최근 50건, 줄별 진행 상태가 붙은 상세, 개정 이력 |

### 선적 (`transport`)

제조사·포워더가 보고하는 출하. **업체가 보고한 사실**이라 추가만 하고 수정·삭제를 제공하지 않으며, 받은 것은 거부하지 않고 이상으로 표시한다(거절은 마스터 데이터에 없는 SKU `UNKNOWN_SKU` 하나). 틀린 선적은 줄 단위로 고치지 않고 선적 전체를 무효화한 뒤 다시 제출한다(아래 "선적의 정정"). 설계 근거는 [06-inbound-design.md](06-inbound-design.md) "선적"이다. 운송 서류·컨테이너·운송 진행 상황은 5b 에서 더한다.

| 항목        | 규칙                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 입구        | `POST /shipments/intake { shipments: [...] }` 1..200건을 한 트랜잭션으로 받는다(배치 어댑터·수기 입력). 요청당 시리얼 총수 상한 50,000, 본문 한도 4MB. 항목은 `poNumber`, `blNumber`, `shipper`, `mode`(`SEA`/`AIR`/`ROAD`), 줄(`sku`, `quantity`, `lotNo`, `serialNumbers`), `source` 등                                                                                                                                                                                                                                                                                    |
| 발주 연결   | 제출의 발주 번호로 발주를 찾는다. **모르는 번호이거나 `ISSUED` 가 아니면 건너뛰지 않고 `purchase_order_id` null 로 기록**하고 이상 `PO_UNLINKED` 를 단다. 사전 계획 차수는 없다(소유자 결정 2026-10-04). 제출된 번호는 `reported_po_number` 에 그대로 남는다                                                                                                                                                                                                                                                                                                                 |
| 줄 맞추기   | 선적 줄을 같은 제품의 발주 줄에 맞춘다: 남은 수량이 있는 열린 줄의 가장 작은 줄 번호 → 열린 줄 → 닫힌 줄(`PO_LINE_CLOSED`) → 취소한 줄(`PO_LINE_CANCELLED`). 같은 제품의 줄이 없으면 null 로 두고 `PO_LINE_UNMATCHED`                                                                                                                                                                                                                                                                                                                                                        |
| 번호        | 발주에 연결되면 `<발주 번호>-R<n>`(n = 그 발주에 도착한 순서), 아니면 `UNLINKED-<id 뒤 12자리>`. 차수는 발주 행을 잠근 트랜잭션 안에서 "연결된 선적 수 + 1"로 매겨 동시 제출이 겹치지 않는다                                                                                                                                                                                                                                                                                                                                                                                 |
| 이상        | `PO_UNLINKED` `PO_LINE_UNMATCHED` `PO_LINE_CLOSED` `PO_LINE_CANCELLED` `OVER_SHIPPED`(선적 누계 > 주문 + 과납 허용) `SERIAL_COUNT_MISMATCH`(시리얼 추적 제품, 목록이 없는 경우 포함) `SERIALS_ON_UNTRACKED_PRODUCT` `DUPLICATE_SERIAL` `SERIAL_SKU_CONFLICT`                                                                                                                                                                                                                                                                                                                 |
| 이상의 저장 | **받을 때 계산해 `shipments.anomalies`(JSON)에 남기고 바꾸지 않는다.** 읽을 때 다시 계산하지 않는 이유: `OVER_SHIPPED` 는 "이 선적이 도착했을 때" 넘쳤는지가 뜻이라, 나중에 다른 차수가 들어온다고 먼저 온 선적이 이상해지면 안 된다. 연결로 해소되는 것(`PO_UNLINKED`, `PO_LINE_UNMATCHED`)만 읽을 때 걸러 내고, 연결 시점에 찾은 이상은 `shipment_links.anomalies` 에서 더한다(`currentAnomalies`)                                                                                                                                                                         |
| 제품 이력   | 시리얼 추적 제품의 시리얼마다 개체가 없으면 만들고 **제조사가 보고한 `DISPATCHED`** 를 남긴다: 출처 `source.system`, 출처 참조 = 선적 번호, 일어난 시각 = `ship_date` 의 UTC 0시(없으면 보고 시각). 이미 다른 SKU 인 시리얼은 이상만 달고 사실을 남기지 않는다. 시리얼 추적이 아닌 제품의 시리얼은 개체를 만들지 않는다. 대량으로 넣고 개체마다 한 번만 다시 접는다                                                                                                                                                                                                          |
| 멱등        | `idempotencyKey` 가 같은 제출은 한 번만 기록하고 `duplicate: true` 로 기존 선적을 가리킨다. 동시에 들어온 같은 키는 unique 위반(MySQL 1062)을 알아보고 트랜잭션을 처음부터 다시 해서 중복으로 돌려준다(500 이 아니다)                                                                                                                                                                                                                                                                                                                                                        |
| 연결 명령   | `POST /shipments/:shipmentNo/link { poNumber, actor, reason }`. 우리가 내리는 명령이라 거절한다: `SHIPMENT_NOT_FOUND`, `SHIPMENT_ALREADY_LINKED`, `PO_NOT_FOUND`, `PO_NOT_ISSUED`, `SHIPMENT_LINES_UNMATCHED`(발주에 같은 SKU 줄이 없는 선적 줄). 통과하면 `shipment_links` 에 연결 전 번호·줄 연결·연결 시점의 이상을 남기고, 선적의 **해석 값**(`purchase_order_id`, `shipment_no`, 줄의 `purchase_order_line_id`)만 채운다. 보고된 값은 바뀌지 않고, 이미 차수를 받은 선적의 번호도 바뀌지 않으며, 이 선적이 그 발주의 다음 차수를 받는다. 연결 전 번호로도 선적을 찾는다 |
| 조회        | `GET /shipments?poNumber=&unlinked=true`(최근 50건), `GET /shipments/:shipmentNo`(줄, 시리얼 수, 지금 유효한 이상, 연결된 발주, 연결 기록)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 제품 등록   | `POST /unit-registrations` 는 `{ serialNumbers, actor }` 또는 `{ shipmentNo, actor }` 를 받는다(함께 보내면 `VALIDATION_FAILED`). 선적 번호는 그 선적의 시리얼 전부로 풀어 같은 제외 규칙을 적용한다                                                                                                                                                                                                                                                                                                                                                                         |

- 선적(차수)은 **발주 하나에 속한다**(소유자 답변 2026-10-04: 같은 송장번호로 묶은 차수가 서로 다른 발주에 걸친 경우는 없고 B/L 과 발주 번호가 함께 온다). 그래서 헤더가 `purchase_order_id` 를 가지고 줄의 `purchase_order_line_id` 가 그 발주의 줄을 가리킨다. 여러 발주를 실은 B/L 이 오면 발주마다 선적을 따로 만들고 같은 `bl_number` 로 묶는다(물리 운송 묶음은 5b).
- 업체가 보낸 원본 보관과 체크포인트를 가진 배치 어댑터는 6단계에서 만든다. 5a 의 입구는 어댑터와 수기 입력이 같이 쓴다.

**선적의 정정** (`shipment_corrections`) — 선적은 사실이라 고치지 않는다. 틀렸으면 **선적 전체를 무효화하고 다시 제출한다**(줄 단위 정정은 없다. 소유자 결정 2026-10-04).

- 명령: `POST /shipments/:shipmentNo/void { actor, reason }`(사유 400자까지). 우리가 내리는 명령이라 거절한다: `SHIPMENT_NOT_FOUND`, `SHIPMENT_ALREADY_VOIDED`(무효화는 한 번뿐). 현재 번호로도 연결 전 번호로도 찾는다. 통과하면 처리자·사유·시각을 `shipment_corrections` 에 추가하고 선적 행은 바꾸지 않는다. 응답은 무효가 된 선적과 정정한·건너뛴 사실 수, 만든 기기 요청 id.
- 다시 제출한 선적은 새 차수 번호를 받는다. 번호를 셀 때는 무효 선적도 센다(`shipment_no` unique). 무효 선적은 **선적 수량 누계와 "이미 알려진 시리얼" 조회에서 빠진다**: 빠지지 않으면 다시 제출한 선적이 `OVER_SHIPPED`·`DUPLICATE_SERIAL` 로 잘못 표시된다. 받을 때 고정한 이상은 바꾸지 않으므로, 앞 차수를 무효화해도 뒤 차수에 이미 붙은 `OVER_SHIPPED` 는 도착 당시의 이상으로 남는다.
- 그 선적이 만든 `DISPATCHED` 사실도 정정으로 무효화한다. 찾는 조건은 종류 `DISPATCHED` + 출처 참조가 지금 선적 번호 또는 연결 전 번호(`shipment_links.previous_shipment_no`) + 이 선적의 시리얼이다(다른 선적이 같은 시리얼에 남긴 사실은 건드리지 않는다). 이미 정정된 사실은 건너뛰고 건수를 돌려준다. 시리얼마다 `scm.unit.event-voided`(대체 사실 없음)를 아웃박스로 내고, 개체는 다시 접는다. 정정 사유는 `선적 <번호> 무효화: <사유>` 로 남는다.
- 다시 접은 결과 기기에서 활성이어야 하는지가 바뀐 개체가 있으면 기기 요청을 무효화 한 번에 종류마다 하나(보통 `DEACTIVATE`) 만든다. 사유는 `SHIPMENT_VOIDED` 다.
- 잠금 순서는 입고와 같이 발주 → 선적 → 개체(시리얼 순)다. 무효화가 발주의 선적 수량 누계를 바꾸므로 발주 행을 먼저 잠근다.
- 무효 선적은 연결 명령과 선적 단위 제품 등록(`POST /unit-registrations`)에서 `SHIPMENT_ALREADY_VOIDED` 로 거절한다. 조회는 그대로 되고 목록과 상세에 `voided`, 상세에 `voidRecord`(처리자·사유·시각)가 있다.

### 재고

`GET /stock` 은 시리얼 제품과 수량 제품을 같은 응답 형태(`StockRow`)로 합친다.

| 구분      | 근거             | `trackingMode`             | `status`   | `registered` | `lotNo`·`stockStatus` | `quantity`                                                       |
| --------- | ---------------- | -------------------------- | ---------- | ------------ | --------------------- | ---------------------------------------------------------------- |
| 시리얼 행 | `units` 를 센 값 | `SERIAL`                   | 개체 상태  | 등록 여부    | null                  | 개수                                                             |
| 수량 행   | 수량 원장의 합   | 제품의 추적 방식(LOT·NONE) | `IN_STOCK` | null         | 원장의 값             | SKU × 거점 × 로트 × 재고 상태별 (들어온 합 - 나간 합), SQL 한 번 |

- 시리얼 행은 `units` 를 SKU × 거점 × 상태 × 등록 여부(`registered`)로 센 값이다. 정정이 이미 반영된 상태에서 세기 때문에 업체 전산과 다를 수 있고, 그 차이가 바로 이 시스템이 드러내려는 것이다.
- `trackingMode` 는 행의 근거를 뜻한다. 개체로 센 행은 제품의 추적 방식이 무엇이든 `SERIAL` 이다.
- 수량 행의 합은 SQL 한 번으로 구한다 (이동을 도착지 `+수량` 줄과 출발지 `-수량` 줄로 풀어 `UNION ALL` 한 뒤 묶는다). **합이 0 인 행은 빼고 음수는 그대로 돌려준다.** 음수는 나간 기록이 들어온 기록보다 많다는 보고 오류의 신호다.
- 순서: 시리얼 행(SKU · 거점 · 상태 · 등록 여부 순)이 먼저, 그다음 수량 행(SKU · 거점 · 로트 · 재고 상태 순).

### 제품 등록과 기기 요청

운영자가 `POST /unit-registrations { serialNumbers (1..5000), actor }` 로 시리얼 목록을 제품으로 등록한다. 우리가 내리는 명령이라 전제 조건을 검사하고, 등록할 수 있는 것만 등록하며 나머지는 사유와 함께 돌려준다.

| 제외 사유            | 뜻                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `UNIT_NOT_FOUND`     | 모르는 시리얼                                                                                         |
| `NOT_SERIAL_TRACKED` | 제품이 `SERIAL` 추적이 아님                                                                           |
| `ALREADY_REGISTERED` | 유효한 `REGISTERED` 사실이 이미 있음 (다시 등록해도 요청을 또 만들지 않는다)                          |
| `NOT_IN_STOCK`       | 개체 상태가 `IN_STOCK` 이 아님. 적치 확인을 요구하는 정책은 입고 보고를 단계별로 받는 단계에서 더한다 |

- 한 트랜잭션에서 시리얼을 한꺼번에 잠그고 `REGISTERED` 사실(출처 `logistics-hub`, `source.ref` = 운영자)을 대량으로 넣은 뒤 개체마다 한 번 다시 접는다. 같은 시리얼이 목록에 여러 번 있으면 한 번만 본다.
- 등록된 것이 있으면 **기기 요청(`REGISTER`) 하나**를 만든다. 응답: `{ requestId | null, registered, excluded }`.
- `REGISTERED` 가 정정으로 무효화되면 `registeredAt` 이 비워진다(접을 때 유효한 사실만 쓰므로).

**기기 서버에 활성이어야 하는가** = `registeredAt` 이 있고 상태가 `DOA`·`SCRAPPED` 가 아님 (`shouldBeActive`). 사실을 다시 접는 모든 usecase(사실 기록, 정정, AS 이벤트 수신)가 접기 전후를 비교하고(`activationChange`), 바뀌었으면 기기 요청을 **명령 하나당 하나** 만든다.
활성 → 비활성은 `DEACTIVATE`(사유: 원인이 된 사실의 종류, 등록 사실을 무효화했으면 `REGISTRATION_VOIDED`), 비활성 → 활성(DOA 정정 등)은 `REGISTER`(등록 명령 자신은 배치 요청 하나를 만들므로 이 경로를 쓰지 않는다).

기기 요청은 `NOT_NOTIFIED → NOTIFIED → IN_PROGRESS → COMPLETED | PARTIALLY_FAILED` 로 계산된다 (알림 시각과 시리얼별 결과에서. 결과가 하나라도 있으면 알림 시각과 무관하게 결과를 따른다).
기기 서버와의 연동 방식은 [03-architecture.md](03-architecture.md) 의 "기기 서버 연동".

## OMS — 주문과 물리 제품 연결

| 테이블                | 내용                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------- |
| `sellables`           | 채널에서 파는 단위 (단품 또는 패키지). `code` 는 unique                                |
| `sellable_components` | 판매 상품이 어떤 SKU 몇 개로 이루어지는지. `(sellable_id, sku)` unique                 |
| `orders`              | 채널 주문. `(channel, channel_order_no)` 로 중복 수신 방지, `public_id` 로 외부에 표시 |
| `order_lines`         | 고객이 주문한 그대로의 줄. 상품명·종류는 주문 시점 값을 복사                           |
| `fulfillment_items`   | **출고해야 할 물리 제품 한 개.** 출고되면 시리얼이 붙는다                              |

### 패키지

단품도 "구성품 1종 1개짜리 판매 상품"으로 같은 구조에 담는다. 주문이 들어오면 줄마다
`구성품 × 주문 수량` 만큼 `fulfillment_items` 를 만든다. 키트(카메라 1 + 배터리 2)를 2개 주문하면 6행이다.

그래서 "어느 주문 → 어느 줄(패키지) → 어느 항목 → 어떤 시리얼"이 그대로 조인으로 나온다.

### 출고 항목의 상태

```
PENDING ──출고 보고──▶ SHIPPED ──배송 완료──▶ DELIVERED
   ▲                      │                      │
   └──── 출고 보고 정정 ───┴──────────────────────┤
                                                 └──DOA 확정──▶ DOA  (+ 교체용 PENDING 항목 생성)
```

- 출고 보고에 항목 id 가 없으면 같은 주문·같은 SKU 의 미출고 항목 중 먼저 만든 것에 붙인다.
- DOA 가 확정되면 그 항목은 `DOA` 가 되고, `replaces_item_id` 로 연결된 교체 출고 항목이 생긴다.
- 주문 상태는 저장하지 않고 계산한다: 불량·취소를 뺀 항목이 모두 배송 완료면 `FULFILLED`.

## AS — DOA 연동 규격

실제 AS 시스템을 대신하는 최소 구현이다. 중요한 것은 테이블이 아니라 **내보내는 이벤트 두 개**다.

| 이벤트             | 언제                        | SCM                         | OMS                        |
| ------------------ | --------------------------- | --------------------------- | -------------------------- |
| `as.doa.confirmed` | 초기 불량으로 판정          | 제품에 `DOA_CONFIRMED` 기록 | 항목 `DOA` 처리, 교체 출고 |
| `as.unit.scrapped` | 폐기 처분된 불량품을 폐기함 | 제품에 `SCRAPPED` 기록      | —                          |

`origin` 으로 판매 출고품의 불량(`SALES`)과 **AS 과정에서 내보낸 교체품의 불량**(`AS_REPLACEMENT`)을 구분한다.
후자는 주문과 무관하므로 OMS 는 무시하고, SCM 은 똑같이 제품 이력에 남긴다.

실제 AS 시스템과 연동할 때는 이 두 이벤트(스키마는 [as.ts](../packages/contracts/src/as.ts))만 맞추면 된다.
