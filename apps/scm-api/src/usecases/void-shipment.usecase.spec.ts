import { describe, expect, it } from 'vitest';

import { IntakeShipmentsRequest, type ShipmentIntakeInput } from '@repo/contracts/transport';

import type { PurchaseOrderHeader } from '../domains/procurement/domain/purchase-order.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { setupPurchaseOrders } from '../testing/memory-purchase-order-repository.js';
import { product, setupMemory } from '../testing/memory-repositories.js';
import { MemoryShipmentRepository } from '../testing/memory-shipment-repository.js';
import { GetShipmentUsecase } from './get-shipment.usecase.js';
import { IntakeShipmentsUsecase } from './intake-shipments.usecase.js';
import { LinkShipmentUsecase } from './link-shipment.usecase.js';
import { RegisterUnitsUsecase } from './register-units.usecase.js';
import { VoidShipmentUsecase } from './void-shipment.usecase.js';

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
  const memory = setupMemory([product()]);
  const { purchaseOrders } = setupPurchaseOrders();
  const shipmentRepository = new MemoryShipmentRepository();
  const shipments = new ShipmentService(shipmentRepository);

  const { order } = await purchaseOrders.create(
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
    ],
    'buyer-1',
  );
  await purchaseOrders.issue(order.poNumber, 'buyer-1');

  const intake = new IntakeShipmentsUsecase(
    memory.tx,
    memory.catalog,
    purchaseOrders,
    shipments,
    memory.units,
    memory.deviceRequests,
  );
  const getShipment = new GetShipmentUsecase(shipments, purchaseOrders, memory.catalog);
  const voidShipment = new VoidShipmentUsecase(
    memory.tx,
    memory.catalog,
    purchaseOrders,
    shipments,
    memory.units,
    memory.deviceRequests,
    getShipment,
  );
  const link = new LinkShipmentUsecase(
    memory.tx,
    memory.catalog,
    purchaseOrders,
    shipments,
    getShipment,
  );
  const register = new RegisterUnitsUsecase(
    memory.tx,
    memory.catalog,
    memory.units,
    memory.deviceRequests,
    shipments,
  );
  const run = (...items: ShipmentIntakeInput[]) =>
    intake.execute(IntakeShipmentsRequest.parse({ shipments: items }));
  const command = { actor: 'op-1', reason: '시리얼 목록이 틀림' };
  return {
    ...memory,
    shipments,
    shipmentRepository,
    poNumber: order.poNumber,
    run,
    voidShipment,
    link,
    register,
    getShipment,
    command,
  };
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

describe('VoidShipmentUsecase', () => {
  it('선적을 무효화하고 그 선적이 만든 DISPATCHED 사실을 정정한다. 사실은 지우지 않는다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository, outbox } = await setup();
    await run(item(poNumber));
    outbox.length = 0;

    const result = await voidShipment.execute(`${poNumber}-R1`, command);

    expect(result).toMatchObject({
      voidedEvents: 2,
      skippedEvents: 0,
      deviceRequestIds: [],
      shipment: {
        shipmentNo: `${poNumber}-R1`,
        voided: true,
        voidRecord: { actor: 'op-1', reason: '시리얼 목록이 틀림' },
      },
    });
    expect(unitRepository.events).toHaveLength(2);
    expect(unitRepository.corrections).toHaveLength(2);
    expect(unitRepository.corrections[0]).toMatchObject({
      replacementEventId: null,
      actor: 'op-1',
      reason: `선적 ${poNumber}-R1 무효화: 시리얼 목록이 틀림`,
    });
    expect(unitRepository.units.map((unit) => unit.status)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(outbox.filter((message) => message.topic === 'scm.unit-events')).toMatchObject([
      { key: 'S1', event: { type: 'scm.unit.event-voided' } },
      { key: 'S2', event: { type: 'scm.unit.event-voided' } },
    ]);
  });

  it('연결 전 번호로 기록된 출발 사실도 정정한다 (사실의 출처 참조에는 기록 당시 번호가 남아 있다)', async () => {
    const { run, link, voidShipment, command, poNumber, unitRepository } = await setup();
    const { shipments } = await run(item('PO-9999-000001'));
    const unlinkedNo = shipments[0]?.shipmentNo ?? '';
    expect(unlinkedNo).toMatch(/^UNLINKED-/);
    await link.execute(unlinkedNo, { poNumber, actor: 'op-1', reason: '번호 오타' });
    expect(unitRepository.events.map((event) => event.source.ref)).toEqual([
      unlinkedNo,
      unlinkedNo,
    ]);

    // 연결 뒤의 차수 번호로 무효화한다. 사실의 출처 참조는 연결 전 번호다.
    const result = await voidShipment.execute(`${poNumber}-R1`, command);

    expect(result.voidedEvents).toBe(2);
    expect(unitRepository.corrections).toHaveLength(2);
  });

  it('다른 선적이 같은 시리얼에 남긴 출발 사실은 건드리지 않는다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository } = await setup();
    await run(
      item(poNumber),
      item(poNumber, {
        blNumber: 'BL-2',
        shipDate: '2026-10-05',
        lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }],
      }),
    );

    const result = await voidShipment.execute(`${poNumber}-R2`, command);

    expect(result.voidedEvents).toBe(1);
    const voided = unitRepository.corrections.map(
      (c) => unitRepository.events.find((e) => e.id === c.targetEventId)?.source.ref,
    );
    expect(voided).toEqual([`${poNumber}-R2`]);
    // S1 에는 R1 의 출발 사실이 남아 있어 그것만으로 다시 접힌다.
    expect(unitRepository.units.find((u) => u.serialNumber === 'S1')).toMatchObject({
      status: 'IN_TRANSIT',
      anomalies: [],
    });
  });

  it('이미 정정된 사실은 건너뛰고 건수를 돌려준다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository } = await setup();
    await run(item(poNumber));
    const first = unitRepository.events[0];
    if (!first) throw new Error('no event');
    await unitRepository.addCorrection({
      targetEventId: first.id,
      replacementEventId: null,
      reason: '먼저 사람이 정정함',
      actor: 'op-2',
      recordedAt: new Date(),
    });

    const result = await voidShipment.execute(`${poNumber}-R1`, command);

    expect(result).toMatchObject({ voidedEvents: 1, skippedEvents: 1 });
  });

  it('같은 시리얼로 다시 제출하면 새 차수 번호를 받고 이상이 없으며, 개체는 다시 IN_TRANSIT 이다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository } = await setup();
    await run(item(poNumber));
    await voidShipment.execute(`${poNumber}-R1`, command);

    const again = await run(item(poNumber, { blNumber: 'BL-1B' }));

    expect(again.shipments[0]).toMatchObject({ shipmentNo: `${poNumber}-R2`, anomalies: [] });
    expect(unitRepository.units.map((unit) => unit.status)).toEqual(['IN_TRANSIT', 'IN_TRANSIT']);
    expect(unitRepository.units.every((unit) => unit.anomalies.length === 0)).toBe(true);
  });

  it('모르는 선적은 SHIPMENT_NOT_FOUND, 이미 무효화한 선적은 SHIPMENT_ALREADY_VOIDED 이고 아무것도 바꾸지 않는다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository } = await setup();
    await run(item(poNumber));
    await expect(voidShipment.execute('NOPE', command)).rejects.toMatchObject({
      code: 'SHIPMENT_NOT_FOUND',
    });

    await voidShipment.execute(`${poNumber}-R1`, command);
    await expect(voidShipment.execute(`${poNumber}-R1`, command)).rejects.toMatchObject({
      code: 'SHIPMENT_ALREADY_VOIDED',
    });
    expect(unitRepository.corrections).toHaveLength(2);
  });

  it('무효화한 선적은 연결 명령과 선적 단위 제품 등록을 거절한다', async () => {
    const { run, link, register, voidShipment, command, poNumber } = await setup();
    const { shipments } = await run(item('PO-9999-000001'));
    const unlinkedNo = shipments[0]?.shipmentNo ?? '';
    await voidShipment.execute(unlinkedNo, command);

    await expect(
      link.execute(unlinkedNo, { poNumber, actor: 'op-1', reason: 'r' }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_ALREADY_VOIDED' });
    await expect(register.execute({ shipmentNo: unlinkedNo, actor: 'op-1' })).rejects.toMatchObject(
      { code: 'SHIPMENT_ALREADY_VOIDED' },
    );
  });

  it('읽은 뒤 잠그는 사이에 선적이 발주에 연결되면 새로 읽은 발주로 처음부터 다시 한다', async () => {
    const { run, link, voidShipment, shipments, command, poNumber, shipmentRepository } =
      await setup();
    const { shipments: stored } = await run(item('PO-9999-000001'));
    const unlinkedNo = stored[0]?.shipmentNo ?? '';

    // 첫 시도의 잠금 직전에 운영자의 연결 명령이 먼저 커밋된 것처럼 만든다.
    const lockForVoid = shipments.lockForVoid.bind(shipments);
    let first = true;
    shipments.lockForVoid = async (shipmentNo) => {
      if (first) {
        first = false;
        await link.execute(shipmentNo, { poNumber, actor: 'op-1', reason: '번호 오타' });
      }
      return lockForVoid(shipmentNo);
    };

    const result = await voidShipment.execute(unlinkedNo, command);

    expect(result.shipment).toMatchObject({ shipmentNo: `${poNumber}-R1`, voided: true });
    expect(shipmentRepository.corrections).toHaveLength(1);
    expect(first).toBe(false);
  });

  it('활성 여부가 바뀐 개체가 있으면 기기 요청을 사유 SHIPMENT_VOIDED 로 하나 만든다', async () => {
    const { run, voidShipment, command, poNumber, unitRepository, deviceRequestRepository } =
      await setup();
    await run(item(poNumber, { lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }] }));
    const [unit] = unitRepository.units;
    if (!unit) throw new Error('no unit');
    const fact = (type: 'RECEIVED' | 'REGISTERED' | 'SCRAPPED', at: string) =>
      unitRepository.addEvent({
        unitId: unit.id,
        type,
        occurredAt: new Date(at),
        recordedAt: new Date(at),
        locationId: type === 'RECEIVED' ? 'L1' : null,
        orderRef: null,
        caseId: null,
        source: { system: 'test', ref: null },
        idempotencyKey: null,
        note: null,
      });
    await fact('RECEIVED', '2026-10-02T00:00:00.000Z');
    await fact('REGISTERED', '2026-10-03T00:00:00.000Z');
    await fact('SCRAPPED', '2026-10-04T00:00:00.000Z');
    // 폐기된 등록 개체가 다시 출발 보고된다 (등록 개체가 다시 활성이 되어 REGISTER 요청이 생긴다).
    await run(
      item(poNumber, {
        blNumber: 'BL-2',
        shipDate: '2026-10-20',
        lines: [{ sku: 'CAM-01', quantity: 1, serialNumbers: ['S1'] }],
      }),
    );
    expect(deviceRequestRepository.requests.map((r) => r.type)).toEqual(['REGISTER']);

    const result = await voidShipment.execute(`${poNumber}-R2`, command);

    expect(result.deviceRequestIds).toHaveLength(1);
    expect(deviceRequestRepository.requests.map((r) => [r.type, r.reason, r.createdBy])).toEqual([
      ['REGISTER', 'DISPATCHED', 'shipment-intake'],
      ['DEACTIVATE', 'SHIPMENT_VOIDED', 'op-1'],
    ]);
    expect(
      deviceRequestRepository.items.filter((i) => i.requestId === result.deviceRequestIds[0]),
    ).toMatchObject([{ serialNumber: 'S1', sku: 'CAM-01' }]);
  });
});
