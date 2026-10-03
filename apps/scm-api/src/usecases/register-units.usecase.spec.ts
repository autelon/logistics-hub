import { describe, expect, it } from 'vitest';

import { product, seedInStock, seedUnit, setupMemory } from '../testing/memory-repositories.js';
import { RegisterUnitsUsecase } from './register-units.usecase.js';

const setup = () => {
  const memory = setupMemory([
    product(),
    product({ id: 'P2', sku: 'BAT-01', trackingMode: 'NONE' }),
  ]);
  const usecase = new RegisterUnitsUsecase(
    memory.tx,
    memory.catalog,
    memory.units,
    memory.deviceRequests,
  );
  return { ...memory, usecase };
};

describe('RegisterUnitsUsecase', () => {
  it('등록할 수 있는 것만 등록하고 나머지는 사유와 함께 돌려준다', async () => {
    const { unitRepository: units, usecase } = setup();
    await seedInStock(units, 'OK-1');
    await seedInStock(units, 'OK-2');
    await seedUnit(units, 'SHIPPED-1', { status: 'SHIPPED' });
    await seedUnit(units, 'DONE-1', { registeredAt: new Date('2026-01-01T00:00:00.000Z') });
    await seedUnit(units, 'BAT-1', { productId: 'P2' });

    const result = await usecase.execute({
      serialNumbers: ['OK-1', 'GHOST', 'SHIPPED-1', 'DONE-1', 'BAT-1', 'OK-2'],
      actor: 'op-1',
    });

    expect(result.registered).toEqual(['OK-1', 'OK-2']);
    expect(result.excluded).toEqual([
      { serialNumber: 'GHOST', reason: 'UNIT_NOT_FOUND' },
      { serialNumber: 'SHIPPED-1', reason: 'NOT_IN_STOCK' },
      { serialNumber: 'DONE-1', reason: 'ALREADY_REGISTERED' },
      { serialNumber: 'BAT-1', reason: 'NOT_SERIAL_TRACKED' },
    ]);
    expect(result.requestId).not.toBeNull();
  });

  it('등록된 개체마다 REGISTERED 사실(출처 logistics-hub, 처리자 = 운영자)을 남기고 상태 캐시에 registeredAt 을 채운다', async () => {
    const { unitRepository: units, usecase } = setup();
    await seedInStock(units, 'OK-1');
    await seedInStock(units, 'OK-2');

    await usecase.execute({ serialNumbers: ['OK-1', 'OK-2'], actor: 'op-1' });

    const registeredFacts = units.events.filter((e) => e.type === 'REGISTERED');
    expect(registeredFacts).toHaveLength(2);
    expect(registeredFacts[0]).toMatchObject({
      source: { system: 'logistics-hub', ref: 'op-1' },
      locationId: null,
    });
    for (const unit of units.units) {
      // 물리 상태는 그대로이고 등록 시각만 채워진다.
      expect(unit.status).toBe('IN_STOCK');
      expect(unit.registeredAt).toBeInstanceOf(Date);
      expect(unit.anomalies).toEqual([]);
    }
  });

  it('배치마다 REGISTER 기기 요청을 정확히 하나 만들고 알림 이벤트를 한 번 적는다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, outbox, usecase } = setup();
    await seedInStock(units, 'OK-1');
    await seedInStock(units, 'OK-2');
    await seedInStock(units, 'OK-3');

    const result = await usecase.execute({
      serialNumbers: ['OK-1', 'OK-2', 'OK-3'],
      actor: 'op-1',
    });

    expect(requests.requests).toHaveLength(1);
    expect(requests.requests[0]).toMatchObject({
      id: result.requestId,
      type: 'REGISTER',
      reason: 'REGISTRATION',
      createdBy: 'op-1',
    });
    expect(requests.items.map((i) => i.serialNumber)).toEqual(['OK-1', 'OK-2', 'OK-3']);
    expect(requests.items.every((i) => i.sku === 'CAM-01' && i.result === 'PENDING')).toBe(true);

    const created = outbox.filter((e) => e.topic === 'scm.device-requests');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      key: result.requestId,
      event: {
        type: 'scm.device-request.created',
        payload: { requestId: result.requestId, type: 'REGISTER', count: 3 },
      },
    });
    // 사실마다 통합 이벤트도 낸다.
    expect(outbox.filter((e) => e.topic === 'scm.unit-events')).toHaveLength(3);
  });

  it('등록된 것이 없으면 기기 요청을 만들지 않고 requestId 는 null 이다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, outbox, usecase } = setup();
    await seedUnit(units, 'SHIPPED-1', { status: 'SHIPPED' });

    const result = await usecase.execute({ serialNumbers: ['SHIPPED-1', 'GHOST'], actor: 'op-1' });

    expect(result.requestId).toBeNull();
    expect(result.registered).toEqual([]);
    expect(requests.requests).toHaveLength(0);
    expect(outbox).toHaveLength(0);
    expect(units.events).toHaveLength(0);
  });

  it('같은 시리얼을 다시 등록하면 ALREADY_REGISTERED 로 제외하고 요청을 또 만들지 않는다', async () => {
    const { unitRepository: units, deviceRequestRepository: requests, usecase } = setup();
    await seedInStock(units, 'OK-1');

    await usecase.execute({ serialNumbers: ['OK-1'], actor: 'op-1' });
    const again = await usecase.execute({ serialNumbers: ['OK-1'], actor: 'op-1' });

    expect(again).toEqual({
      requestId: null,
      registered: [],
      excluded: [{ serialNumber: 'OK-1', reason: 'ALREADY_REGISTERED' }],
    });
    expect(requests.requests).toHaveLength(1);
    expect(units.events.filter((e) => e.type === 'REGISTERED')).toHaveLength(1);
  });

  it('목록에 같은 시리얼이 여러 번 있어도 한 번만 등록한다', async () => {
    const { unitRepository: units, usecase } = setup();
    await seedInStock(units, 'OK-1');

    const result = await usecase.execute({
      serialNumbers: ['OK-1', 'OK-1', 'OK-1'],
      actor: 'op-1',
    });

    expect(result.registered).toEqual(['OK-1']);
    expect(result.excluded).toEqual([]);
    expect(units.events.filter((e) => e.type === 'REGISTERED')).toHaveLength(1);
  });
});
