import { describe, expect, it } from 'vitest';

import type { AsCaseMessage } from '@repo/contracts/as';

import { seedUnit, setupMemory } from '../testing/memory-repositories.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';

const setup = () => {
  const memory = setupMemory();
  const usecase = new ApplyAsCaseEventUsecase(
    memory.tx,
    memory.catalog,
    memory.units,
    memory.deviceRequests,
  );
  return { ...memory, usecase };
};

const doaConfirmed: AsCaseMessage = {
  id: '6f1d2c3e-0000-4000-8000-000000000001',
  type: 'as.doa.confirmed',
  emittedAt: '2026-03-01T00:00:00.000Z',
  payload: {
    caseId: 'CASE-1',
    serialNumber: 'SN-1',
    origin: 'SALES',
    disposition: 'SCRAP',
    confirmedAt: '2026-03-01T00:00:00.000Z',
  },
};

describe('ApplyAsCaseEventUsecase', () => {
  it('아는 시리얼이면 사실로 기록하고 알리며 상태를 다시 계산한다', async () => {
    const { unitRepository: units, outbox, usecase } = setup();
    await seedUnit(units, 'SN-1', {
      status: 'DELIVERED',
      orderRef: { orderId: 'O-1', fulfillmentItemId: null },
    });

    expect(await usecase.execute(doaConfirmed)).toBe('recorded');

    expect(units.events).toHaveLength(1);
    expect(units.events[0]).toMatchObject({
      type: 'DOA_CONFIRMED',
      caseId: 'CASE-1',
      source: { system: 'as-api', ref: 'CASE-1' },
      idempotencyKey: `message:${doaConfirmed.id}`,
      note: 'SALES / SCRAP',
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      topic: 'scm.unit-events',
      key: 'SN-1',
      event: {
        type: 'scm.unit.event-recorded',
        payload: {
          serialNumber: 'SN-1',
          sku: 'CAM-01',
          eventType: 'DOA_CONFIRMED',
          caseId: 'CASE-1',
        },
      },
    });
    // 유효한 사실이 DOA_CONFIRMED 하나뿐이라 DELIVERED 캐시는 DOA 로 다시 계산된다 (앞선 사실 없음 → 이상 표시).
    expect(units.units[0]?.status).toBe('DOA');
  });

  it('등록된 제품이 DOA 로 확정되면 DEACTIVATE 기기 요청을 하나 만든다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, outbox, usecase } = setup();
    const registeredAt = new Date('2026-02-01T00:00:00.000Z');
    const unit = await seedUnit(units, 'SN-1', { status: 'DELIVERED', registeredAt });
    await units.addEvent({
      unitId: unit.id,
      type: 'REGISTERED',
      occurredAt: registeredAt,
      recordedAt: registeredAt,
      locationId: null,
      orderRef: null,
      caseId: null,
      source: { system: 'logistics-hub', ref: 'op-1' },
      idempotencyKey: null,
      note: null,
    });

    await usecase.execute(doaConfirmed);

    expect(units.units[0]).toMatchObject({ status: 'DOA', registeredAt });
    expect(requests.requests).toHaveLength(1);
    expect(requests.requests[0]).toMatchObject({
      type: 'DEACTIVATE',
      reason: 'DOA_CONFIRMED',
      createdBy: 'as-api',
    });
    expect(requests.items).toMatchObject([
      { requestId: requests.requests[0]?.id, serialNumber: 'SN-1', sku: 'CAM-01' },
    ]);
    expect(outbox.map((e) => e.topic)).toEqual(['scm.unit-events', 'scm.device-requests']);
    expect(outbox[1]).toMatchObject({
      key: requests.requests[0]?.id,
      event: {
        type: 'scm.device-request.created',
        payload: { requestId: requests.requests[0]?.id, type: 'DEACTIVATE', count: 1 },
      },
    });
  });

  it('등록되지 않은 제품은 DOA 가 되어도 기기 요청을 만들지 않는다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, usecase } = setup();
    await seedUnit(units, 'SN-1', { status: 'DELIVERED' });

    await usecase.execute(doaConfirmed);

    expect(requests.requests).toHaveLength(0);
  });

  it('같은 메시지가 다시 오면 아무것도 하지 않는다', async () => {
    const { unitRepository: units, outbox, usecase } = setup();
    await seedUnit(units, 'SN-1', {
      status: 'DELIVERED',
      orderRef: { orderId: 'O-1', fulfillmentItemId: null },
    });

    await usecase.execute(doaConfirmed);
    expect(await usecase.execute(doaConfirmed)).toBe('duplicate');

    expect(units.events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it('모르는 시리얼이면 기록하지 않는다', async () => {
    const { unitRepository: units, outbox, usecase } = setup();

    expect(await usecase.execute(doaConfirmed)).toBe('unknown-serial');

    expect(units.units).toHaveLength(0);
    expect(units.events).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });
});
