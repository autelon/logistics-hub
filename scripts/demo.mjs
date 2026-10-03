// 제품 한 개가 제조되어 패키지 주문으로 출고되고, 잘못된 출고 보고가 정정되고,
// DOA 로 폐기되고, 교체품이 다시 나가기까지를 실제 API 로 재현한다.
// 사용: 세 서비스를 띄운 뒤 `node scripts/demo.mjs`

const SCM = process.env.SCM_URL ?? 'http://localhost:3001';
const OMS = process.env.OMS_URL ?? 'http://localhost:3002';
const AS = process.env.AS_URL ?? 'http://localhost:3003';

const run = Date.now().toString(36).toUpperCase();
const sn = (name) => `${name}-${run}`;
// 과거 날짜에서 하루씩 진행하다가, AS 가 개입한 뒤(live)부터는 실제 현재 시각을 쓴다.
// AS 서비스가 자기 이벤트에 현재 시각을 찍기 때문에 그래야 이력 순서가 자연스럽다.
const start = Date.now() - 30 * 86_400_000;
let day = 0;
let live = false;
const nextDay = () => new Date(live ? Date.now() : start + ++day * 86_400_000).toISOString();

const call = async (base, path, body) => {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${JSON.stringify(json)}`);
  return json;
};

const report = (serialNumber, type, extra = {}) =>
  call(SCM, '/unit-events', {
    serialNumber,
    type,
    occurredAt: nextDay(),
    source: { system: extra.system ?? 'demo' },
    ...extra,
  });

/** 서비스 간 이벤트는 비동기로 전달되므로 조건이 맞을 때까지 기다린다. */
const until = async (what, read, done) => {
  for (let i = 0; i < 50; i++) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`기다리다 포기: ${what}`);
};
const items = (order) => order.lines.flatMap((l) => l.items);
const step = (text) => console.log(`\n▶ ${text}`);

step('기준 정보: SKU 2종, 거점 3곳, 패키지 상품 1종');
// 이 데모는 제품 등록(활성화)을 다루지 않는다. 등록 없이 출고해도 "미등록 개체" 이상이 붙지 않도록
// 등록이 필요 없는 NONE 으로 둔다. 등록 흐름은 docs/playbooks/registration.md.
await call(SCM, '/products', { sku: 'CAM-01', name: '카메라', trackingMode: 'NONE' });
await call(SCM, '/products', { sku: 'BAT-01', name: '배터리', trackingMode: 'NONE' });
await call(SCM, '/locations', {
  code: 'FAC-SZ',
  name: '선전 공장',
  type: 'FACTORY',
  partner: '제조사 A',
});
await call(SCM, '/locations', {
  code: 'WH-ICN',
  name: '인천 창고',
  type: 'WAREHOUSE',
  partner: '3PL B',
});
await call(SCM, '/locations', {
  code: 'SVC-SEL',
  name: '서울 서비스센터',
  type: 'SERVICE_CENTER',
  partner: 'AS 업체 C',
});
await call(OMS, '/sellables', {
  code: 'KIT-01',
  name: '카메라 스타터 키트',
  components: [
    { sku: 'CAM-01', quantity: 1 },
    { sku: 'BAT-01', quantity: 1 },
  ],
});

step('제조 → 이동 → 창고 입고 (카메라 2대, 배터리 1개)');
for (const [serial, sku] of [
  [sn('CAM-A'), 'CAM-01'],
  [sn('CAM-B'), 'CAM-01'],
  [sn('BAT-A'), 'BAT-01'],
]) {
  await report(serial, 'MANUFACTURED', { sku, locationCode: 'FAC-SZ', system: '제조사 A' });
  await report(serial, 'DISPATCHED', { system: '제조사 A' });
  await report(serial, 'RECEIVED', { locationCode: 'WH-ICN', system: '3PL B' });
}

step('네이버 스마트스토어에서 키트 1개 주문');
const { orderId } = await call(OMS, '/orders', {
  channel: 'naver-smartstore',
  channelOrderNo: `N-${run}`,
  orderedAt: nextDay(),
  lines: [{ sellableCode: 'KIT-01', quantity: 1 }],
});
const orderRef = { orderId };

step('창고가 출고 보고 — 그런데 카메라 시리얼을 잘못 찍었다 (실제는 CAM-A, 보고는 CAM-B)');
const wrong = await report(sn('CAM-B'), 'SHIPPED', { orderRef, system: '3PL B' });
await report(sn('BAT-A'), 'SHIPPED', { orderRef, system: '3PL B' });
await until(
  '주문에 CAM-B 연결',
  () => call(OMS, `/orders/${orderId}`),
  (o) => items(o).some((i) => i.serialNumber === sn('CAM-B')),
);

step('정정: CAM-B 출고 보고를 무효화하고, 실제로 나간 CAM-A 의 출고를 기록');
await call(SCM, `/unit-events/${wrong.eventId}/corrections`, {
  reason: '창고 스캔 오류. 실물 확인 결과 CAM-A 가 출고됨',
  actor: 'demo-operator',
});
await report(sn('CAM-A'), 'SHIPPED', { orderRef, system: 'logistics-hub:correction' });
await until(
  '주문의 카메라가 CAM-A 로 바뀜',
  () => call(OMS, `/orders/${orderId}`),
  (o) =>
    items(o).some((i) => i.serialNumber === sn('CAM-A')) &&
    !items(o).some((i) => i.serialNumber === sn('CAM-B')),
);
console.log(
  '  CAM-B 현재 상태:',
  (await call(SCM, `/units/${sn('CAM-B')}`)).status,
  '(재고로 복귀)',
);

step('배송 완료 (택배사는 주문 정보 없이 보고)');
await report(sn('CAM-A'), 'DELIVERED', { system: '택배사 D' });
await report(sn('BAT-A'), 'DELIVERED', { system: '택배사 D' });
await until(
  '주문 FULFILLED',
  () => call(OMS, `/orders/${orderId}`),
  (o) => o.status === 'FULFILLED',
);

step('고객이 카메라 초기 불량 접수 → AS 가 DOA 확정(폐기 처분)');
const serviceCase = await call(AS, '/cases', {
  serialNumber: sn('CAM-A'),
  origin: 'SALES',
  symptom: '전원이 켜지지 않음',
});
await call(AS, `/cases/${serviceCase.id}/confirm-doa`, { disposition: 'SCRAP' });
live = true;
await until(
  'SCM 에 DOA 반영',
  () => call(SCM, `/units/${sn('CAM-A')}`),
  (u) => u.status === 'DOA',
);
await until(
  'OMS 가 교체 출고 항목 생성',
  () => call(OMS, `/orders/${orderId}`),
  (o) => items(o).some((i) => i.reason === 'DOA_REPLACEMENT'),
);

step('불량품 회수 → 서비스센터에서 폐기');
await report(sn('CAM-A'), 'RETURN_RECEIVED', { locationCode: 'SVC-SEL', system: 'AS 업체 C' });
await call(AS, `/cases/${serviceCase.id}/scrap`, {});
await until(
  'SCM 에 폐기 반영',
  () => call(SCM, `/units/${sn('CAM-A')}`),
  (u) => u.status === 'SCRAPPED',
);

step('교체품 CAM-B 출고 → 배송 완료');
await report(sn('CAM-B'), 'SHIPPED', { orderRef, system: '3PL B' });
await report(sn('CAM-B'), 'DELIVERED', { system: '택배사 D' });
const order = await until(
  '주문 다시 FULFILLED',
  () => call(OMS, `/orders/${orderId}`),
  (o) => o.status === 'FULFILLED' && items(o).some((i) => i.serialNumber === sn('CAM-B')),
);

step(`결과 — ${sn('CAM-A')} 의 생애주기`);
const unit = await call(SCM, `/units/${sn('CAM-A')}`);
console.table(
  unit.events.map((e) => ({
    일어난날: e.occurredAt.slice(0, 10),
    사실: e.type,
    거점: e.locationCode ?? '',
    출처: e.source.system,
    케이스: e.caseId ? '있음' : '',
  })),
);
console.log(`  최종 상태: ${unit.status}, 이상: ${unit.anomalies.length}건`);

step('결과 — 주문의 출고 항목');
console.table(
  items(order).map((i) => ({ SKU: i.sku, 상태: i.status, 시리얼: i.serialNumber, 사유: i.reason })),
);
console.log(`  주문 상태: ${order.status}`);
console.log(`\n웹 콘솔에서 확인: http://localhost:5173/?sn=${sn('CAM-A')}`);
