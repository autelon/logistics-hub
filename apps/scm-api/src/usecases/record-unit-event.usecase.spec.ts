import { describe, expect, it, vi } from 'vitest';

import type { RecordUnitEventRequest } from '@repo/contracts/scm';

import { UnitConflict, type UnitConflictReason } from '../domains/unit/domain/unit-conflict.js';
import { seedInStock, setupMemory } from '../testing/memory-repositories.js';
import { RecordUnitEventUsecase } from './record-unit-event.usecase.js';
import { MAX_ATTEMPTS } from './retry-on-conflict.js';

const request = (overrides: Partial<RecordUnitEventRequest> = {}): RecordUnitEventRequest => ({
  serialNumber: 'SN-1',
  sku: 'CAM-01',
  type: 'STORED',
  occurredAt: '2026-10-01T00:00:00.000Z',
  locationCode: null,
  orderRef: null,
  caseId: null,
  source: { system: 'wms-a', ref: null },
  idempotencyKey: 'key-1',
  note: null,
  ...overrides,
});

const setup = () => {
  const memory = setupMemory();
  const usecase = new RecordUnitEventUsecase(
    memory.tx,
    memory.catalog,
    memory.units,
    memory.deviceRequests,
  );
  return { ...memory, usecase };
};

const conflict = (reason: UnitConflictReason) =>
  new UnitConflict(reason, new Error('driver error'));

describe('RecordUnitEventUsecase 의 멱등 키', () => {
  it('같은 idempotencyKey 를 다시 보내면 새로 기록하지 않고 기존 사실을 가리킨다', async () => {
    const { usecase, unitRepository: units } = setup();

    const first = await usecase.execute(request());
    const second = await usecase.execute(request());

    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ eventId: first.eventId, duplicate: true });
    expect(units.events.filter((e) => e.idempotencyKey === 'key-1')).toHaveLength(1);
  });

  describe('같은 보고가 동시에 와서 졌을 때', () => {
    it('이미 있는 시리얼: 이긴 쪽의 사실을 가리키며 중복으로 돌려준다', async () => {
      const { usecase, unitRepository: units } = setup();
      await seedInStock(units, 'SN-1');
      const store = units.addEvent.bind(units);
      let winnerId = '';
      // 진 쪽의 INSERT 가 막혀 있는 동안 이긴 쪽이 커밋한 것처럼, 같은 키의 사실을 넣고 충돌을 던진다.
      vi.spyOn(units, 'addEvent').mockImplementationOnce(async (event) => {
        winnerId = (await store(event)).id;
        throw conflict('idempotencyKey');
      });

      const result = await usecase.execute(request());

      expect(result).toEqual({ eventId: winnerId, duplicate: true });
      expect(units.events.filter((e) => e.idempotencyKey === 'key-1')).toHaveLength(1);
    });

    it('처음 보는 시리얼: 이긴 쪽이 만든 시리얼과 사실을 알아보고 중복으로 돌려준다', async () => {
      const { usecase, unitRepository: units } = setup();
      const create = units.createUnit.bind(units);
      const store = units.addEvent.bind(units);
      let winnerId = '';
      vi.spyOn(units, 'createUnit').mockImplementationOnce(async (unit) => {
        const created = await create(unit);
        winnerId = (
          await store({
            unitId: created.id,
            type: 'STORED',
            occurredAt: new Date('2026-10-01T00:00:00.000Z'),
            recordedAt: new Date(),
            locationId: null,
            orderRef: null,
            caseId: null,
            source: { system: 'wms-a', ref: null },
            idempotencyKey: 'key-1',
            note: null,
          })
        ).id;
        throw conflict('serialNumber');
      });

      const result = await usecase.execute(request());

      expect(result).toEqual({ eventId: winnerId, duplicate: true });
      expect(units.units).toHaveLength(1);
      expect(units.events).toHaveLength(1);
    });

    it('교착으로 희생되면 롤백된 뒤 다시 해서 기록한다', async () => {
      const { usecase, unitRepository: units } = setup();
      vi.spyOn(units, 'createUnit').mockRejectedValueOnce(conflict('deadlock'));

      const result = await usecase.execute(request());

      expect(result.duplicate).toBe(false);
      expect(units.events.map((e) => e.id)).toEqual([result.eventId]);
    });

    it('시리얼에서만 졌고 키가 다르면 다시 하면서 새 사실로 기록한다', async () => {
      const { usecase, unitRepository: units } = setup();
      const create = units.createUnit.bind(units);
      vi.spyOn(units, 'createUnit').mockImplementationOnce(async (unit) => {
        await create(unit);
        throw conflict('serialNumber');
      });

      const result = await usecase.execute(request());

      expect(result.duplicate).toBe(false);
      expect(units.units).toHaveLength(1);
      expect(units.events.map((e) => e.id)).toEqual([result.eventId]);
    });
  });

  it('계속 지면 시도를 다 쓰고 에러를 그대로 던진다 (무한히 다시 하지 않는다)', async () => {
    const { usecase, unitRepository: units } = setup();
    await seedInStock(units, 'SN-1');
    const spy = vi.spyOn(units, 'addEvent').mockRejectedValue(conflict('idempotencyKey'));

    await expect(usecase.execute(request())).rejects.toBeInstanceOf(UnitConflict);
    expect(spy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('고유 키 위반이 아닌 에러는 다시 하지 않는다', async () => {
    const { usecase, unitRepository: units } = setup();
    await seedInStock(units, 'SN-1');
    const spy = vi.spyOn(units, 'addEvent').mockRejectedValue(new Error('connection lost'));

    await expect(usecase.execute(request())).rejects.toThrow('connection lost');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
