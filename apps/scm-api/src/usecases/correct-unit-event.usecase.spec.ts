import { describe, expect, it } from 'vitest';

import { seedInStock, seedUnit, setupMemory } from '../testing/memory-repositories.js';
import { setupMemoryShipments } from '../testing/memory-shipment-repository.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';
import { CorrectUnitEventUsecase } from './correct-unit-event.usecase.js';
import { RegisterUnitsUsecase } from './register-units.usecase.js';

const setup = () => {
  const memory = setupMemory();
  return {
    ...memory,
    register: new RegisterUnitsUsecase(
      memory.tx,
      memory.catalog,
      memory.units,
      memory.deviceRequests,
      setupMemoryShipments().service,
    ),
    applyAs: new ApplyAsCaseEventUsecase(
      memory.tx,
      memory.catalog,
      memory.units,
      memory.deviceRequests,
    ),
    correct: new CorrectUnitEventUsecase(
      memory.tx,
      memory.catalog,
      memory.units,
      memory.deviceRequests,
    ),
  };
};

describe('CorrectUnitEventUsecase 의 기기 요청', () => {
  it('등록 사실을 무효화하면 registeredAt 이 비워지고 REGISTRATION_VOIDED 사유의 DEACTIVATE 요청이 생긴다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, register, correct } = setup();
    await seedInStock(units, 'SN-1');
    await register.execute({ serialNumbers: ['SN-1'], actor: 'op-1' });
    const registered = units.events.find((e) => e.type === 'REGISTERED');
    expect(units.units[0]?.registeredAt).not.toBeNull();

    await correct.execute(registered?.id ?? '', {
      reason: '잘못 등록',
      actor: 'op-2',
      replacement: null,
    });

    expect(units.units[0]?.registeredAt).toBeNull();
    expect(requests.requests.map((r) => [r.type, r.reason, r.createdBy])).toEqual([
      ['REGISTER', 'REGISTRATION', 'op-1'],
      ['DEACTIVATE', 'REGISTRATION_VOIDED', 'op-2'],
    ]);
    expect(requests.items.filter((i) => i.requestId === requests.requests[1]?.id)).toHaveLength(1);
  });

  it('DOA 확정을 무효화해 다시 활성이 되면 REGISTER 요청이 생긴다', async () => {
    const {
      unitRepository: units,
      deviceRequestRepository: requests,
      register,
      applyAs,
      correct,
    } = setup();
    await seedInStock(units, 'SN-1');
    await register.execute({ serialNumbers: ['SN-1'], actor: 'op-1' });
    await applyAs.execute({
      id: '6f1d2c3e-0000-4000-8000-000000000002',
      type: 'as.doa.confirmed',
      emittedAt: '2026-03-01T00:00:00.000Z',
      payload: {
        caseId: 'CASE-1',
        serialNumber: 'SN-1',
        origin: 'SALES',
        disposition: 'SCRAP',
        confirmedAt: '2026-03-01T00:00:00.000Z',
      },
    });
    expect(units.units[0]?.status).toBe('DOA');
    const doa = units.events.find((e) => e.type === 'DOA_CONFIRMED');

    await correct.execute(doa?.id ?? '', { reason: '오판', actor: 'op-2', replacement: null });

    expect(units.units[0]?.status).toBe('IN_STOCK');
    expect(requests.requests.map((r) => [r.type, r.reason])).toEqual([
      ['REGISTER', 'REGISTRATION'],
      ['DEACTIVATE', 'DOA_CONFIRMED'],
      ['REGISTER', 'DOA_CONFIRMED_VOIDED'],
    ]);
    expect(requests.requests[2]?.createdBy).toBe('op-2');
  });

  it('활성 여부가 바뀌지 않는 정정은 요청을 만들지 않는다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, correct } = setup();
    const unit = await seedUnit(units, 'SN-1');
    const at = new Date('2026-03-01T00:00:00.000Z');
    const stored = await units.addEvent({
      unitId: unit.id,
      type: 'STORED',
      occurredAt: at,
      recordedAt: at,
      locationId: null,
      orderRef: null,
      caseId: null,
      source: { system: 'wms', ref: null },
      idempotencyKey: null,
      note: null,
    });

    await correct.execute(stored.id, { reason: '오기', actor: 'op-2', replacement: null });

    expect(requests.requests).toHaveLength(0);
  });
});
