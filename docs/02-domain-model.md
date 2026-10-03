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

| 테이블                   | 내용                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `products`               | SKU 기준 정보. `sku` 는 unique 코드                                           |
| `locations`              | 재고가 있을 수 있는 거점 (공장·창고·서비스센터)과 운영 업체. `code` 는 unique |
| `units`                  | 물리 제품 한 개. 현재 상태·위치·주문은 **이력에서 계산한 캐시**               |
| `unit_events`            | 제품에 일어난 사실. **추가만 한다**                                           |
| `unit_event_corrections` | 정정 기록. 어떤 사실을 무효로 하고 무엇으로 대체했는지, 사유, 처리자          |

### 사실(unit event)의 종류와 상태 변화

| 사실              | 뜻             | 정상적으로 올 수 있는 상태         | 결과 상태             |
| ----------------- | -------------- | ---------------------------------- | --------------------- |
| `MANUFACTURED`    | 제조 완료      | (처음)                             | `PRODUCED`            |
| `DISPATCHED`      | 거점에서 출발  | `PRODUCED`, `IN_STOCK`             | `IN_TRANSIT`          |
| `RECEIVED`        | 입고           | `IN_TRANSIT`                       | `IN_STOCK`            |
| `STORED`          | 적재           | `IN_STOCK`                         | `IN_STOCK`            |
| `SHIPPED`         | 주문 출고      | `IN_STOCK`                         | `SHIPPED`             |
| `DELIVERED`       | 배송 완료      | `SHIPPED`                          | `DELIVERED`           |
| `RETURN_RECEIVED` | 회수 입고      | `SHIPPED`, `DELIVERED`, `DOA`      | `RETURNED` (DOA 유지) |
| `DOA_CONFIRMED`   | 초기 불량 확정 | `SHIPPED`, `DELIVERED`, `RETURNED` | `DOA`                 |
| `SCRAPPED`        | 폐기           | `DOA`, `RETURNED`, `IN_STOCK`      | `SCRAPPED`            |

표의 "올 수 있는 상태"가 아닌 곳에서 사실이 오면 **반영은 하되 이상으로 표시**한다.
`DISPATCHED`·`SHIPPED`·`DELIVERED`·`SCRAPPED` 는 거점을 비운다. 특히 `DELIVERED` 는 제품이 고객 손에 있다는 뜻이라, 출고가 무효화되어 입고 뒤 배송 완료만 남아도 위치는 비고 재고에는 거점 없이 `DELIVERED` 로 잡힌다. 이후 `RETURN_RECEIVED` 가 오면 회수 거점이 다시 위치가 된다.
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

### 재고

`GET /stock` 은 `units` 를 SKU × 거점 × 상태로 센 값이다. 정정이 이미 반영된 상태에서 세기 때문에
업체 전산과 다를 수 있고, 그 차이가 바로 이 시스템이 드러내려는 것이다.

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
