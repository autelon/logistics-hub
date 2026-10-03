import { describe, expect, it } from 'vitest';

import { setupMemoryShipments } from '../../../testing/memory-shipment-repository.js';
import type { PlanningOrder } from '../domain/shipment-plan.js';
import type { ShipmentDraft } from './shipment.service.js';

const draft = (overrides: Partial<ShipmentDraft> = {}): ShipmentDraft => ({
  purchaseOrder: { id: 'PO1', poNumber: 'PO-2026-000001' },
  reportedPoNumber: 'PO-2026-000001',
  blNumber: 'BL-1',
  invoiceNumber: null,
  shipper: 'ACME',
  mode: 'SEA',
  shipDate: null,
  eta: null,
  source: { system: 'acme-portal', ref: null },
  idempotencyKey: null,
  reportedAt: new Date('2026-10-04T00:00:00.000Z'),
  recordedAt: new Date('2026-10-04T00:00:01.000Z'),
  note: null,
  anomalies: [],
  lines: [
    {
      lineNo: 1,
      purchaseOrderLineId: 'POL1',
      productId: 'P1',
      shippedQty: 2,
      lotNo: null,
      serialNumbers: ['S1', 'S2'],
    },
  ],
  ...overrides,
});

const cameraLine = {
  id: 'POL9',
  lineNo: 1,
  productId: 'P1',
  orderedQty: 10,
  overTolerancePct: null,
  closed: false,
  cancelled: false,
};

const order: PlanningOrder = { poNumber: 'PO-2026-000002', lines: [cameraLine] };

describe('ShipmentService.record', () => {
  it('발주마다 도착 순서대로 차수 번호를 매기고, 같은 요청 안에서도 이어서 센다', async () => {
    const { service } = setupMemoryShipments();

    const first = await service.record([draft(), draft({ blNumber: 'BL-2' })]);
    const next = await service.record([draft({ blNumber: 'BL-3' })]);

    expect(first.map((s) => s.shipmentNo)).toEqual(['PO-2026-000001-R1', 'PO-2026-000001-R2']);
    expect(next.map((s) => s.shipmentNo)).toEqual(['PO-2026-000001-R3']);
  });

  it('발주가 다르면 차수를 따로 센다', async () => {
    const { service } = setupMemoryShipments();
    const stored = await service.record([
      draft(),
      draft({ purchaseOrder: { id: 'PO2', poNumber: 'PO-2026-000002' } }),
    ]);
    expect(stored.map((s) => s.shipmentNo)).toEqual(['PO-2026-000001-R1', 'PO-2026-000002-R1']);
  });

  it('발주에 연결되지 않은 선적은 UNLINKED 번호이고 차수를 쓰지 않는다', async () => {
    const { service } = setupMemoryShipments();
    const stored = await service.record([draft({ purchaseOrder: null }), draft()]);
    expect(stored[0]?.shipmentNo).toMatch(/^UNLINKED-/);
    expect(stored[0]?.purchaseOrderId).toBeNull();
    expect(stored[1]?.shipmentNo).toBe('PO-2026-000001-R1');
  });
});

describe('ShipmentService.link', () => {
  const unlinked = async () => {
    const memory = setupMemoryShipments();
    await memory.service.record([draft()]); // PO-2026-000001-R1
    const [stored] = await memory.service.record([
      draft({ purchaseOrder: null, reportedPoNumber: 'PO-OLD' }),
    ]);
    const linkTarget = { id: 'PO2', order };
    return { ...memory, shipmentNo: stored?.shipmentNo ?? '', linkTarget };
  };

  it('발주 줄에 맞추고 그 발주의 다음 차수 번호를 받는다. 보고된 값은 그대로다', async () => {
    const { service, repository, shipmentNo, linkTarget } = await unlinked();

    const detail = await service.link(
      shipmentNo,
      linkTarget,
      new Map([['P1', 'CAM-01']]),
      { actor: 'op-1', reason: '번호 오타' },
      new Date('2026-10-05T00:00:00.000Z'),
    );

    expect(detail.shipment.shipmentNo).toBe('PO-2026-000002-R1');
    expect(detail.shipment.purchaseOrderId).toBe('PO2');
    expect(detail.shipment.reportedPoNumber).toBe('PO-OLD');
    expect(detail.lines[0]?.purchaseOrderLineId).toBe('POL9');
    expect(detail.link).toMatchObject({
      previousShipmentNo: shipmentNo,
      shipmentNo: 'PO-2026-000002-R1',
      actor: 'op-1',
      reason: '번호 오타',
    });
    // 이미 차수를 받은 선적의 번호는 바뀌지 않는다.
    expect(repository.shipments[0]?.shipmentNo).toBe('PO-2026-000001-R1');
  });

  it('연결 전 번호로도 찾을 수 있다', async () => {
    const { service, shipmentNo, linkTarget } = await unlinked();
    await service.link(shipmentNo, linkTarget, new Map(), { actor: 'op-1', reason: 'r' });
    const found = await service.get(shipmentNo);
    expect(found.shipment.shipmentNo).toBe('PO-2026-000002-R1');
  });

  it('이미 연결된 선적은 SHIPMENT_ALREADY_LINKED', async () => {
    const { service, shipmentNo, linkTarget } = await unlinked();
    await service.link(shipmentNo, linkTarget, new Map(), { actor: 'op-1', reason: 'r' });
    await expect(
      service.link('PO-2026-000001-R1', linkTarget, new Map(), { actor: 'op-1', reason: 'r' }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_ALREADY_LINKED' });
  });

  it('모르는 선적은 SHIPMENT_NOT_FOUND', async () => {
    const { service, linkTarget } = await unlinked();
    await expect(
      service.link('NOPE', linkTarget, new Map(), { actor: 'op-1', reason: 'r' }),
    ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_FOUND' });
  });

  it('발주에 맞는 줄이 없는 선적 줄이 있으면 SHIPMENT_LINES_UNMATCHED 이고 아무것도 바꾸지 않는다', async () => {
    const { service, repository, shipmentNo } = await unlinked();
    const noCamera: PlanningOrder = {
      poNumber: 'PO-2026-000002',
      lines: [{ ...cameraLine, productId: 'P2' }],
    };
    await expect(
      service.link(shipmentNo, { id: 'PO2', order: noCamera }, new Map([['P1', 'CAM-01']]), {
        actor: 'op-1',
        reason: 'r',
      }),
    ).rejects.toMatchObject({
      code: 'SHIPMENT_LINES_UNMATCHED',
      details: { lines: [{ lineNo: 1, sku: 'CAM-01' }] },
    });
    expect(repository.links).toEqual([]);
    expect(repository.shipments[1]?.purchaseOrderId).toBeNull();
  });
});
