import { describe, expect, it } from 'vitest';

import { product, seedUnit, setupMemory } from '../../../testing/memory-repositories.js';
import type { NewUnitEvent } from '../domain/unit.js';

const dispatched = (at: string): NewUnitEvent => ({
  type: 'DISPATCHED',
  occurredAt: new Date(at),
  location: null,
  orderRef: null,
  caseId: null,
  source: { system: 'acme-portal', ref: 'PO-1-R1' },
  idempotencyKey: null,
  note: null,
});

describe('UnitService.createAll', () => {
  it('처음 보는 시리얼들을 한 번에 UNKNOWN 상태로 등록한다', async () => {
    const { units, unitRepository } = setupMemory();
    const created = await units.createAll([
      { serialNumber: 'A', product: product() },
      { serialNumber: 'B', product: product() },
    ]);
    expect(created.map((unit) => unit.serialNumber)).toEqual(['A', 'B']);
    expect(unitRepository.units.map((unit) => unit.status)).toEqual(['UNKNOWN', 'UNKNOWN']);
  });
});

describe('UnitService.recordAll', () => {
  it('사실을 한 번에 기록하고 알리고, 개체마다 한 번 다시 계산한다', async () => {
    const { units, unitRepository, outbox } = setupMemory();
    const [a, b] = await units.createAll([
      { serialNumber: 'A', product: product() },
      { serialNumber: 'B', product: product() },
    ]);
    if (!a || !b) throw new Error('units were not created');

    const requests = await units.recordAll([
      { unit: a, product: product(), fact: dispatched('2026-10-01T00:00:00.000Z') },
      { unit: b, product: product(), fact: dispatched('2026-10-01T00:00:00.000Z') },
    ]);

    expect(requests).toEqual([]);
    expect(unitRepository.events).toHaveLength(2);
    expect(unitRepository.events.map((event) => event.type)).toEqual(['DISPATCHED', 'DISPATCHED']);
    expect(unitRepository.units.map((unit) => unit.status)).toEqual(['IN_TRANSIT', 'IN_TRANSIT']);
    expect(outbox.map((message) => message.key)).toEqual(['A', 'B']);
  });

  it('한 개체에 사실이 둘이면 둘 다 기록하고 한 번 다시 계산한다', async () => {
    const { units, unitRepository } = setupMemory();
    const unit = await seedUnit(unitRepository, 'A', { status: 'UNKNOWN' });

    await units.recordAll([
      { unit, product: product(), fact: dispatched('2026-10-01T00:00:00.000Z') },
      { unit, product: product(), fact: dispatched('2026-10-05T00:00:00.000Z') },
    ]);

    expect(unitRepository.events).toHaveLength(2);
    // 두 번째 출발은 이미 이동 중인 개체에 오므로 이상으로 표시된다 (거부하지 않는다).
    expect(unitRepository.units[0]?.anomalies.some((a) => a.includes('IN_TRANSIT'))).toBe(true);
  });

  it('등록된 개체가 다시 활성이 되면 기기 요청 종류를 돌려준다', async () => {
    const { units, unitRepository } = setupMemory();
    // 폐기된 등록 개체에 출발 사실이 오면 상태가 SCRAPPED 를 벗어나 활성 조건을 다시 만족한다.
    const unit = await seedUnit(unitRepository, 'A', {
      status: 'SCRAPPED',
      registeredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await unitRepository.addEvent({
      unitId: unit.id,
      type: 'REGISTERED',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      locationId: null,
      orderRef: null,
      caseId: null,
      source: { system: 'logistics-hub', ref: 'op' },
      idempotencyKey: null,
      note: null,
    });

    const requests = await units.recordAll([
      { unit, product: product(), fact: dispatched('2026-10-01T00:00:00.000Z') },
    ]);

    expect(requests.map((request) => request.deviceRequest)).toEqual(['REGISTER']);
  });
});
