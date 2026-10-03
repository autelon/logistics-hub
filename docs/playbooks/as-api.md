# as-api 플레이북

준비와 변수(`AS`, `RUN`, `post`, `get`)는 [README.md](README.md). as-api 와 MySQL 만 있으면 된다 (이벤트가 전달되는지는 [scm-api.md](scm-api.md) 30–33, [oms-api.md](oms-api.md) 17–19).
규격: `packages/contracts/src/as.ts`. 에러 코드와 상태: `apps/as-api/src/errors.ts`.

### 1. 접수 — publicId 는 `CASE-<UTC 연도>-<6자리>`

```sh
post $AS/cases "{\"serialNumber\":\"CAM-A-$RUN\",\"origin\":\"SALES\",\"symptom\":\"전원이 켜지지 않음\"}"
```

기대 → 201:

```json
{
  "id": "<uuid>",
  "publicId": "CASE-2026-<6자리>",
  "serialNumber": "CAM-A-<RUN>",
  "origin": "SALES",
  "symptom": "전원이 켜지지 않음",
  "relatedCaseId": null,
  "status": "OPEN",
  "disposition": null,
  "openedAt": "<시각>",
  "confirmedAt": null,
  "scrappedAt": null
}
```

`id` 를 `C1` 에 담는다. 깨끗한 DB 면 `CASE-2026-000001`.

### 2. 교체품 접수 — origin AS_REPLACEMENT, 원래 케이스 참조. 번호는 바로 다음 수

```sh
post $AS/cases "{\"serialNumber\":\"CAM-B-$RUN\",\"origin\":\"AS_REPLACEMENT\",\"symptom\":\"교체품도 불량\",\"relatedCaseId\":\"$C1\"}"
```

기대 → 201: 1 과 같은 모양이고 `"origin":"AS_REPLACEMENT"`, `"relatedCaseId":"<C1>"`, `publicId` 는 1 의 번호 + 1. `id` 를 `C2` 에 담는다.

### 3. 조회

```sh
get $AS/cases/$C1
```

기대: 1 의 응답과 같은 본문 → 200

### 4. 목록 — 최근 50건, 최신이 앞

```sh
get $AS/cases
```

기대 → 200: 첫 원소가 `C2`, 둘째가 `C1` (이전 실행의 접수가 뒤에 더 있을 수 있다).

### 5. CASE_NOT_FOUND

```sh
get $AS/cases/00000000-0000-0000-0000-000000000000
post $AS/cases/00000000-0000-0000-0000-000000000000/confirm-doa '{"disposition":"SCRAP"}'
```

기대: 둘 다 `{"code":"CASE_NOT_FOUND","message":"Case 00000000-0000-0000-0000-000000000000 not found"}` → 404

### 6. 접수 요청 검증

```sh
post $AS/cases '{"serialNumber":"","origin":"RETAIL","symptom":""}'
```

기대 → 400: `{"code":"VALIDATION_FAILED","details":[{"path":"serialNumber","message":"Too small: expected string to have >=1 characters"},{"path":"origin","message":"Invalid option: expected one of \"SALES\"|\"AS_REPLACEMENT\""},{"path":"symptom","message":"Too small: expected string to have >=1 characters"}]}`

### 7. OPEN 상태에서 폐기 → CASE_NOT_SCRAPPABLE

```sh
post $AS/cases/$C1/scrap '{}'
```

기대: `{"code":"CASE_NOT_SCRAPPABLE","message":"Case <C1> is OPEN/no disposition, expected DOA_CONFIRMED/SCRAP"}` → 409

### 8. 기각

```sh
post $AS/cases/$C2/reject
```

기대 → 200: 2 의 본문에서 `"status":"REJECTED"` (본문 없이 POST 해도 된다)

### 9. 판정이 끝난 접수는 다시 판정할 수 없다 → CASE_NOT_OPEN

```sh
post $AS/cases/$C2/confirm-doa '{"disposition":"SCRAP"}'
post $AS/cases/$C2/reject
```

기대: 둘 다 `{"code":"CASE_NOT_OPEN","message":"Case <C2> is REJECTED, expected OPEN"}` → 409

### 10. 판정 요청 검증

```sh
post $AS/cases/$C1/confirm-doa '{"disposition":"BURN"}'
```

기대: `{"code":"VALIDATION_FAILED","details":[{"path":"disposition","message":"Invalid option: expected one of \"SCRAP\"|\"RETURN_TO_VENDOR\""}]}` → 400

### 11. DOA 확정 (반품 처분)

```sh
post $AS/cases/$C1/confirm-doa '{"disposition":"RETURN_TO_VENDOR"}'
```

기대 → 200: `"status":"DOA_CONFIRMED"`, `"disposition":"RETURN_TO_VENDOR"`, `"confirmedAt":"<시각>"`, `scrappedAt` 은 `null`.

### 12. 반품 처분은 폐기할 수 없다 → CASE_NOT_SCRAPPABLE

```sh
post $AS/cases/$C1/scrap '{}'
```

기대: `{"code":"CASE_NOT_SCRAPPABLE","message":"Case <C1> is DOA_CONFIRMED/RETURN_TO_VENDOR, expected DOA_CONFIRMED/SCRAP"}` → 409

### 13. 폐기 처분으로 확정한 뒤 폐기

```sh
post $AS/cases "{\"serialNumber\":\"CAM-C-$RUN\",\"origin\":\"SALES\",\"symptom\":\"x\"}"
# id 를 C3 에 담는다
post $AS/cases/$C3/confirm-doa '{"disposition":"SCRAP"}'
post $AS/cases/$C3/scrap '{}'
```

기대: 접수 201. 확정 → 200 `"status":"DOA_CONFIRMED","disposition":"SCRAP"`. 폐기 → 200 `"status":"SCRAPPED"`, `"scrappedAt":"<시각>"`, `confirmedAt` 유지.

### 14. 아웃박스 — 확정과 폐기만 이벤트를 낸다 (접수·기각은 내지 않는다)

```sh
docker-compose exec -T mysql mysql -uroot -proot lh_as -e "SELECT \`key\`, JSON_EXTRACT(payload,'$.type') AS type, published_at IS NOT NULL AS published FROM outbox_events WHERE \`key\` LIKE '%-$RUN' ORDER BY id"
```

기대 (서브에이전트는 `lh_as` 대신 자기 DB):

```
CAM-A-<RUN>  "as.doa.confirmed"   1
CAM-C-<RUN>  "as.doa.confirmed"   1
CAM-C-<RUN>  "as.unit.scrapped"   1
```

`CAM-B-<RUN>`(기각) 행은 없다. 직후에 보면 `published` 가 0 일 수 있다 (릴레이 0.5초 주기).

### 15. 없는 경로

```sh
get $AS/cases/x/y
```

기대: `{"code":"NOT_FOUND","message":"Cannot GET /cases/x/y"}` → 404
