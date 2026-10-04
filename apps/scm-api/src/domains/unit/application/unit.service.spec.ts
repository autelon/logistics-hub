import { describe, expect, it } from 'vitest';

import { product, seedUnit, setupMemory } from '../../../testing/memory-repositories.js';
import type { NewUnitEvent } from '../domain/unit.js';

const dispatched = (at: string, ref = 'PO-1-R1'): NewUnitEvent => ({
  type: 'DISPATCHED',
  occurredAt: new Date(at),
  location: null,
  orderRef: null,
  caseId: null,
  source: { system: 'acme-portal', ref },
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

describe('UnitService.voidAll', () => {
  const setupDispatched = async (serials: string[], ref = 'PO-1-R1') => {
    const memory = setupMemory();
    const units = await memory.units.createAll(
      serials.map((serialNumber) => ({ serialNumber, product: product() })),
    );
    await memory.units.recordAll(
      units.map((unit) => ({
        unit,
        product: product(),
        fact: dispatched('2026-10-01T00:00:00.000Z', ref),
      })),
    );
    memory.outbox.length = 0;
    const targetsOf = async (refs: string[]) =>
      (await memory.units.findBySource(units, { type: 'DISPATCHED', sourceRefs: refs })).map(
        (event) => {
          const unit = units.find((candidate) => candidate.id === event.unitId);
          if (!unit) throw new Error(`No unit for event ${event.id}`);
          return { event, unit, product: product(), locationCode: null };
        },
      );
    return { ...memory, created: units, targetsOf };
  };
  const correction = { reason: '선적 PO-1-R1 무효화: 목록이 틀림', actor: 'op-1' };

  it('사실마다 정정을 남기고 event-voided 를 하나씩 적고, 개체를 다시 접는다 (사실은 지우지 않는다)', async () => {
    const { units, unitRepository, outbox, targetsOf } = await setupDispatched(['A', 'B']);

    const result = await units.voidAll(await targetsOf(['PO-1-R1']), correction);

    expect(result).toEqual({ voided: 2, skipped: 0, deviceRequests: [] });
    expect(unitRepository.events).toHaveLength(2);
    expect(unitRepository.corrections).toHaveLength(2);
    expect(unitRepository.corrections[0]).toMatchObject({
      replacementEventId: null,
      reason: correction.reason,
      actor: 'op-1',
    });
    expect(unitRepository.units.map((unit) => unit.status)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(outbox.map((message) => [message.topic, message.key])).toEqual([
      ['scm.unit-events', 'A'],
      ['scm.unit-events', 'B'],
    ]);
    expect(outbox[0]?.event).toMatchObject({
      type: 'scm.unit.event-voided',
      payload: {
        serialNumber: 'A',
        eventType: 'DISPATCHED',
        reason: correction.reason,
        replacementEventId: null,
      },
    });
  });

  it('이미 정정된 사실은 건너뛰고 건수를 돌려준다. 건너뛴 사실은 다시 알리지 않는다', async () => {
    const { units, unitRepository, outbox, targetsOf } = await setupDispatched(['A', 'B', 'C']);
    const targets = await targetsOf(['PO-1-R1']);
    const alreadyCorrected = targets[1];
    if (!alreadyCorrected) throw new Error('no target');
    await unitRepository.addCorrection({
      targetEventId: alreadyCorrected.event.id,
      replacementEventId: null,
      reason: '먼저 사람이 정정함',
      actor: 'op-2',
      recordedAt: new Date(),
    });

    const result = await units.voidAll(targets, correction);

    expect(result).toMatchObject({ voided: 2, skipped: 1 });
    expect(unitRepository.corrections).toHaveLength(3);
    expect(outbox.map((message) => message.key)).toEqual(['A', 'C']);
  });

  it('전부 이미 정정되었으면 아무것도 하지 않는다', async () => {
    const { units, unitRepository, outbox, targetsOf } = await setupDispatched(['A']);
    const targets = await targetsOf(['PO-1-R1']);
    await units.voidAll(targets, correction);
    outbox.length = 0;

    const again = await units.voidAll(targets, correction);

    expect(again).toEqual({ voided: 0, skipped: 1, deviceRequests: [] });
    expect(unitRepository.corrections).toHaveLength(1);
    expect(outbox).toEqual([]);
  });

  it('다른 선적이 남긴 출발 사실은 건드리지 않는다: 그것만으로 다시 접는다', async () => {
    const { units, unitRepository, created, targetsOf } = await setupDispatched(['A']);
    const [unit] = created;
    if (!unit) throw new Error('no unit');
    await units.recordAll([
      { unit, product: product(), fact: dispatched('2026-10-05T00:00:00.000Z', 'PO-1-R2') },
    ]);
    expect(unitRepository.units[0]?.anomalies.length).toBeGreaterThan(0); // 두 번째 출발은 이상

    const result = await units.voidAll(await targetsOf(['PO-1-R1']), correction);

    expect(result.voided).toBe(1);
    expect(unitRepository.units[0]).toMatchObject({ status: 'IN_TRANSIT', anomalies: [] });
    expect(
      unitRepository.corrections.map(
        (c) => unitRepository.events.find((e) => e.id === c.targetEventId)?.source.ref,
      ),
    ).toEqual(['PO-1-R1']);
  });

  it('다시 접은 결과 활성 여부가 바뀌면 기기 요청 종류를 돌려준다 (폐기된 등록 개체가 다시 출발 보고된 선적의 무효화)', async () => {
    const { units, unitRepository, targetsOf } = await setupDispatched(['A']);
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
    // DISPATCHED(PO-1-R1, 10-01) → RECEIVED → REGISTERED → SCRAPPED → 다시 출발(PO-1-R2, 10-20)
    await fact('RECEIVED', '2026-10-02T00:00:00.000Z');
    await fact('REGISTERED', '2026-10-03T00:00:00.000Z');
    await fact('SCRAPPED', '2026-10-04T00:00:00.000Z');
    await units.recordAll([
      { unit, product: product(), fact: dispatched('2026-10-20T00:00:00.000Z', 'PO-1-R2') },
    ]);
    expect(unitRepository.units[0]).toMatchObject({ status: 'IN_TRANSIT' });
    expect(unitRepository.units[0]?.registeredAt).not.toBeNull();

    const result = await units.voidAll(await targetsOf(['PO-1-R2']), correction);

    expect(unitRepository.units[0]?.status).toBe('SCRAPPED');
    expect(
      result.deviceRequests.map((request) => [request.unit.serialNumber, request.deviceRequest]),
    ).toEqual([['A', 'DEACTIVATE']]);
  });

  it('정정할 사실이 없으면 아무것도 하지 않는다', async () => {
    const { units, unitRepository } = setupMemory();
    expect(await units.voidAll([], correction)).toEqual({
      voided: 0,
      skipped: 0,
      deviceRequests: [],
    });
    expect(unitRepository.corrections).toEqual([]);
  });
});

describe('UnitService.findBySource', () => {
  it('종류와 출처 참조가 모두 맞는 사실만 찾고 정정된 것도 포함한다', async () => {
    const { units, unitRepository } = setupMemory();
    const [a] = await units.createAll([{ serialNumber: 'A', product: product() }]);
    if (!a) throw new Error('no unit');
    await units.recordAll([
      { unit: a, product: product(), fact: dispatched('2026-10-01T00:00:00.000Z', 'PO-1-R1') },
      { unit: a, product: product(), fact: dispatched('2026-10-02T00:00:00.000Z', 'UNLINKED-abc') },
      { unit: a, product: product(), fact: dispatched('2026-10-03T00:00:00.000Z', 'PO-1-R2') },
    ]);
    const first = unitRepository.events[0];
    if (!first) throw new Error('no event');
    await unitRepository.addCorrection({
      targetEventId: first.id,
      replacementEventId: null,
      reason: 'r',
      actor: 'a',
      recordedAt: new Date(),
    });

    const found = await units.findBySource([a], {
      type: 'DISPATCHED',
      sourceRefs: ['PO-1-R1', 'UNLINKED-abc'],
    });
    const none = await units.findBySource([a], { type: 'RECEIVED', sourceRefs: ['PO-1-R1'] });

    expect(found.map((event) => event.source.ref)).toEqual(['PO-1-R1', 'UNLINKED-abc']);
    expect(none).toEqual([]);
  });
});
