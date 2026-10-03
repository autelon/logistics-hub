import { describe, expect, it } from 'vitest';

import { IntakeShipmentsRequest, type ShipmentIntakeInput } from '@repo/contracts/transport';

import type { PurchaseOrderHeader } from '../domains/procurement/domain/purchase-order.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { ShipmentConflict } from '../domains/transport/domain/shipment-conflict.js';
import { setupPurchaseOrders } from '../testing/memory-purchase-order-repository.js';
import { product, seedUnit, setupMemory } from '../testing/memory-repositories.js';
import { MemoryShipmentRepository } from '../testing/memory-shipment-repository.js';
import { IntakeShipmentsUsecase } from './intake-shipments.usecase.js';

const header: PurchaseOrderHeader = {
  supplier: 'ACME',
  orderDate: '2026-10-04',
  currency: 'USD',
  destinationLocationId: 'LOC1',
  incoterm: null,
  incotermPlace: null,
  supplierOrderRef: null,
  paymentTerms: null,
  remarks: null,
};

const setup = async () => {
  const memory = setupMemory([
    product(),
    product({ id: 'P2', sku: 'LENS-01', trackingMode: 'NONE' }),
  ]);
  const { purchaseOrders } = setupPurchaseOrders();
  const shipmentRepository = new MemoryShipmentRepository();
  const shipments = new ShipmentService(shipmentRepository);

  const created = await purchaseOrders.create(
    header,
    [
      {
        productId: 'P1',
        orderedQty: 3,
        requestedDeliveryDate: '2026-11-01',
        unitPrice: null,
        overTolerancePct: null,
        underTolerancePct: null,
      },
      {
        productId: 'P2',
        orderedQty: 5,
        requestedDeliveryDate: '2026-11-01',
        unitPrice: null,
        overTolerancePct: null,
        underTolerancePct: null,
      },
    ],
    'buyer-1',
  );
  const { poNumber } = created.order;
  await purchaseOrders.issue(poNumber, 'buyer-1');

  const usecase = new IntakeShipmentsUsecase(
    memory.tx,
    memory.catalog,
    purchaseOrders,
    shipments,
    memory.units,
    memory.deviceRequests,
  );
  const run = (...items: ShipmentIntakeInput[]) =>
    usecase.execute(IntakeShipmentsRequest.parse({ shipments: items }));
  return { ...memory, purchaseOrders, shipmentRepository, poNumber, run };
};

const item = (
  poNumber: string,
  overrides: Partial<ShipmentIntakeInput> = {},
): ShipmentIntakeInput => ({
  poNumber,
  blNumber: 'BL-1',
  shipper: 'ACME',
  mode: 'SEA',
  shipDate: '2026-10-01',
  lines: [{ sku: 'CAM-01', quantity: 2, serialNumbers: ['S1', 'S2'] }],
  source: { system: 'acme-portal' },
  ...overrides,
});

describe('IntakeShipmentsUsecase', () => {
  it('발주에 연결하고 차수 번호를 매기며 시리얼마다 DISPATCHED 사실을 남긴다', async () => {
    const { run, poNumber, unitRepository, shipmentRepository, outbox } = await setup();

    const result = await run(item(poNumber));

    expect(result.shipments).toEqual([
      { shipmentNo: `${poNumber}-R1`, duplicate: false, poNumber, anomalies: [] },
    ]);
    expect(shipmentRepository.lines[0]?.purchaseOrderLineId).not.toBeNull();
    expect(unitRepository.units.map((unit) => [unit.serialNumber, unit.status])).toEqual([
      ['S1', 'IN_TRANSIT'],
      ['S2', 'IN_TRANSIT'],
    ]);
    expect(unitRepository.events).toHaveLength(2);
    expect(unitRepository.events[0]).toMatchObject({
      type: 'DISPATCHED',
      occurredAt: new Date('2026-10-01T00:00:00.000Z'),
      source: { system: 'acme-portal', ref: `${poNumber}-R1` },
      locationId: null,
    });
    expect(outbox.filter((e) => e.topic === 'scm.unit-events')).toHaveLength(2);
  });

  it('shipDate 가 없으면 보고 시각을 일어난 시각으로 쓴다', async () => {
    const { run, poNumber, unitRepository } = await setup();
    await run(item(poNumber, { shipDate: null, reportedAt: '2026-09-30T12:00:00Z' }));
    expect(unitRepository.events[0]?.occurredAt).toEqual(new Date('2026-09-30T12:00:00.000Z'));
  });

  it('같은 발주의 다음 제출은 R2 이고, 같은 요청 안에서도 도착 순서대로 센다', async () => {
    const { run, poNumber } = await setup();

    const first = await run(
      item(poNumber, { lines: [{ sku: 'LENS-01', quantity: 1 }] }),
      item(poNumber, { blNumber: 'BL-2', lines: [{ sku: 'LENS-01', quantity: 1 }] }),
    );
    const second = await run(item(poNumber, { lines: [{ sku: 'LENS-01', quantity: 1 }] }));

    expect(first.shipments.map((s) => s.shipmentNo)).toEqual([`${poNumber}-R1`, `${poNumber}-R2`]);
    expect(second.shipments.map((s) => s.shipmentNo)).toEqual([`${poNumber}-R3`]);
  });

  it('모르는 발주 번호도 기록하고 PO_UNLINKED 로 표시하며, 시리얼은 제품 이력으로 이어진다', async () => {
    const { run, unitRepository, shipmentRepository } = await setup();

    const result = await run(item('PO-9999-000001'));

    const [shipment] = result.shipments;
    expect(shipment?.shipmentNo).toMatch(/^UNLINKED-/);
    expect(shipment?.poNumber).toBeNull();
    expect(shipment?.anomalies.map((a) => a.code)).toEqual(['PO_UNLINKED']);
    expect(shipmentRepository.shipments[0]).toMatchObject({
      purchaseOrderId: null,
      reportedPoNumber: 'PO-9999-000001',
    });
    expect(unitRepository.events).toHaveLength(2);
  });

  it('초안(DRAFT) 발주도 연결하지 않고 이상으로 표시한다', async () => {
    const { run, purchaseOrders } = await setup();
    const draft = await purchaseOrders.create(header, [], 'buyer-1');
    const result = await run(item(draft.order.poNumber));
    expect(result.shipments[0]?.anomalies[0]).toMatchObject({
      code: 'PO_UNLINKED',
      message: expect.stringContaining('DRAFT'),
    });
  });

  it('시리얼 수가 수량과 다르면 SERIAL_COUNT_MISMATCH 를 내지만 기록하고 보고된 시리얼은 이력을 남긴다', async () => {
    const { run, poNumber, unitRepository } = await setup();
    const result = await run(
      item(poNumber, { lines: [{ sku: 'CAM-01', quantity: 3, serialNumbers: ['S1', 'S2'] }] }),
    );
    expect(result.shipments[0]?.anomalies.map((a) => a.code)).toEqual(['SERIAL_COUNT_MISMATCH']);
    expect(unitRepository.events).toHaveLength(2);
  });

  it('선적 누계가 주문 수량을 넘으면 OVER_SHIPPED 이고 그래도 기록한다', async () => {
    const { run, poNumber } = await setup();
    await run(
      item(poNumber, { lines: [{ sku: 'CAM-01', quantity: 2, serialNumbers: ['S1', 'S2'] }] }),
    );
    const second = await run(
      item(poNumber, {
        blNumber: 'BL-2',
        lines: [{ sku: 'CAM-01', quantity: 2, serialNumbers: ['S3', 'S4'] }],
      }),
    );
    expect(second.shipments[0]?.shipmentNo).toBe(`${poNumber}-R2`);
    expect(second.shipments[0]?.anomalies.map((a) => a.code)).toEqual(['OVER_SHIPPED']);
  });

  it('다른 선적에 이미 있는 시리얼은 DUPLICATE_SERIAL 이다', async () => {
    const { run, poNumber } = await setup();
    await run(item(poNumber, { lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }] }));
    const second = await run(
      item(poNumber, {
        blNumber: 'BL-2',
        lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }],
      }),
    );
    expect(second.shipments[0]?.anomalies.map((a) => a.code)).toEqual(['DUPLICATE_SERIAL']);
  });

  it('이미 다른 SKU 로 있는 시리얼은 이상으로 표시하고 이력을 남기지 않는다', async () => {
    const { run, poNumber, unitRepository } = await setup();
    await seedUnit(unitRepository, 'S1', { productId: 'P2', status: 'IN_STOCK' });

    const result = await run(
      item(poNumber, { lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }] }),
    );

    expect(result.shipments[0]?.anomalies.map((a) => a.code)).toEqual(['SERIAL_SKU_CONFLICT']);
    expect(unitRepository.events).toHaveLength(0);
  });

  it('시리얼 추적이 아닌 제품의 시리얼은 이상으로 표시하고 개체를 만들지 않는다', async () => {
    const { run, poNumber, unitRepository } = await setup();
    const result = await run(
      item(poNumber, { lines: [{ sku: 'LENS-01', quantity: 1, serialNumbers: ['L1'] }] }),
    );
    expect(result.shipments[0]?.anomalies.map((a) => a.code)).toEqual([
      'SERIALS_ON_UNTRACKED_PRODUCT',
    ]);
    expect(unitRepository.units).toHaveLength(0);
  });

  it('모르는 SKU 는 항목 번호와 함께 거절하고 아무것도 기록하지 않는다', async () => {
    const { run, poNumber, shipmentRepository } = await setup();
    await expect(
      run(item(poNumber), item(poNumber, { lines: [{ sku: 'NOPE', quantity: 1 }] })),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_SKU',
      details: { index: 1, lineNo: 1, sku: 'NOPE' },
    });
    expect(shipmentRepository.shipments).toHaveLength(0);
  });

  it('같은 idempotencyKey 는 한 번만 기록하고 duplicate: true 로 기존 선적을 가리킨다', async () => {
    const { run, poNumber, shipmentRepository, unitRepository } = await setup();
    const keyed = item(poNumber, { idempotencyKey: 'acme-1' });

    const first = await run(keyed);
    const again = await run(keyed);

    expect(first.shipments[0]).toMatchObject({ duplicate: false, shipmentNo: `${poNumber}-R1` });
    expect(again.shipments[0]).toMatchObject({
      duplicate: true,
      shipmentNo: `${poNumber}-R1`,
      poNumber,
    });
    expect(shipmentRepository.shipments).toHaveLength(1);
    expect(unitRepository.events).toHaveLength(2);
  });

  it('한 요청 안에서 같은 idempotencyKey 가 반복되면 앞의 것만 기록한다', async () => {
    const { run, poNumber, shipmentRepository } = await setup();
    const keyed = item(poNumber, { idempotencyKey: 'acme-1' });

    const result = await run(keyed, keyed);

    expect(result.shipments.map((s) => [s.shipmentNo, s.duplicate])).toEqual([
      [`${poNumber}-R1`, false],
      [`${poNumber}-R1`, true],
    ]);
    expect(shipmentRepository.shipments).toHaveLength(1);
  });

  it('동시 요청에게 져서 ShipmentConflict 가 나면 처음부터 다시 해서 이긴 쪽을 중복으로 알아본다', async () => {
    const { run, poNumber, shipmentRepository } = await setup();
    const keyed = item(poNumber, { idempotencyKey: 'acme-1' });
    const insertAll = shipmentRepository.insertAll.bind(shipmentRepository);
    let first = true;
    shipmentRepository.insertAll = async (drafts) => {
      if (first) {
        first = false;
        // 다른 요청이 같은 키로 먼저 커밋한 것처럼 만든 뒤 진 쪽의 오류를 낸다.
        await insertAll(drafts);
        throw new ShipmentConflict(new Error('duplicate key'));
      }
      return insertAll(drafts);
    };

    const result = await run(keyed);

    expect(result.shipments[0]).toMatchObject({ duplicate: true, shipmentNo: `${poNumber}-R1` });
    expect(shipmentRepository.shipments).toHaveLength(1);
  });
});
