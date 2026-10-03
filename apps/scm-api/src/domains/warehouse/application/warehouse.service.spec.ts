import { describe, expect, it } from 'vitest';

import { MemoryStockMovementRepository } from '../../../testing/memory-repositories.js';
import type { NewStockMovement } from '../domain/stock-movement.js';
import { WarehouseService } from './warehouse.service.js';

const NOW = new Date('2026-10-04T00:00:00.000Z');

const movement = (overrides: Partial<NewStockMovement> = {}): NewStockMovement => ({
  productId: 'P1',
  lotNo: null,
  fromLocationId: null,
  toLocationId: 'WH',
  quantity: 10,
  stockStatus: 'AVAILABLE',
  reason: 'GOODS_RECEIPT',
  occurredAt: NOW,
  recordedAt: NOW,
  source: { system: 'wms-a', ref: null },
  idempotencyKey: null,
  note: null,
  reversesMovementId: null,
  ...overrides,
});

const setup = () => {
  const repository = new MemoryStockMovementRepository();
  return { repository, service: new WarehouseService(repository) };
};

describe('WarehouseService.record', () => {
  it('요청 순서대로 기록하고 순서대로 돌려준다', async () => {
    const { repository, service } = setup();

    const results = await service.record([
      movement({ quantity: 1 }),
      movement({ quantity: 2 }),
      movement({ quantity: 3 }),
    ]);

    expect(results).toEqual([
      { movementId: 'M1', duplicate: false },
      { movementId: 'M2', duplicate: false },
      { movementId: 'M3', duplicate: false },
    ]);
    expect(repository.movements.map((m) => m.quantity)).toEqual([1, 2, 3]);
  });

  it('이미 저장된 idempotencyKey 는 기록하지 않고 기존 이동을 가리킨다', async () => {
    const { repository, service } = setup();
    await service.record([movement({ idempotencyKey: 'k1' })]);

    const results = await service.record([
      movement({ idempotencyKey: 'k1' }),
      movement({ idempotencyKey: 'k2' }),
    ]);

    expect(results).toEqual([
      { movementId: 'M1', duplicate: true },
      { movementId: 'M2', duplicate: false },
    ]);
    expect(repository.movements).toHaveLength(2);
  });

  it('같은 요청 안에서 키가 겹치면 뒤 항목은 앞 항목의 이동을 가리킨다', async () => {
    const { repository, service } = setup();

    const results = await service.record([
      movement({ idempotencyKey: 'k' }),
      movement({ quantity: 99 }),
      movement({ idempotencyKey: 'k', quantity: 5 }),
    ]);

    expect(results).toEqual([
      { movementId: 'M1', duplicate: false },
      { movementId: 'M2', duplicate: false },
      { movementId: 'M1', duplicate: true },
    ]);
    expect(repository.movements).toHaveLength(2);
  });

  it('거점이 없거나 수량이 양수가 아닌 이동은 입구가 뚫린 것이라 던진다', async () => {
    const { repository, service } = setup();

    await expect(
      service.record([movement(), movement({ fromLocationId: null, toLocationId: null })]),
    ).rejects.toThrow('NO_LOCATION');
    await expect(service.record([movement({ quantity: 0 })])).rejects.toThrow(
      'NON_POSITIVE_QUANTITY',
    );
    expect(repository.movements).toHaveLength(0);
  });
});

describe('WarehouseService.reverse', () => {
  const correction = { reason: '잘못 입력', actor: 'op-1' };

  it('반대 방향의 이동을 추가하고 원래 이동은 바꾸지 않는다', async () => {
    const { repository, service } = setup();
    await service.record([movement({ fromLocationId: 'WH', toLocationId: 'SVC', quantity: 4 })]);
    const original = structuredClone(repository.movements[0]);

    const reversal = await service.reverse('M1', correction, NOW);

    expect(reversal).toMatchObject({
      id: 'M2',
      fromLocationId: 'SVC',
      toLocationId: 'WH',
      quantity: 4,
      reason: 'ADJUSTMENT',
      reversesMovementId: 'M1',
    });
    expect(repository.movements[0]).toEqual(original);
    expect([...repository.netByLocation().values()]).toEqual([0, 0]);
  });

  it('없는 이동은 MOVEMENT_NOT_FOUND', async () => {
    const { service } = setup();
    await expect(service.reverse('ghost', correction, NOW)).rejects.toMatchObject({
      code: 'MOVEMENT_NOT_FOUND',
    });
  });

  it('한 번 되돌린 이동은 다시 되돌릴 수 없다', async () => {
    const { repository, service } = setup();
    await service.record([movement()]);
    await service.reverse('M1', correction, NOW);

    await expect(service.reverse('M1', correction, NOW)).rejects.toMatchObject({
      code: 'MOVEMENT_ALREADY_REVERSED',
    });
    expect(repository.movements).toHaveLength(2);
  });

  it('역분개도 이동이라 한 번 되돌릴 수 있고, 되돌리면 원래 효과가 돌아온다', async () => {
    const { repository, service } = setup();
    await service.record([movement({ quantity: 6 })]);
    const first = await service.reverse('M1', correction, NOW);

    const second = await service.reverse(first.id, correction, NOW);

    expect(second).toMatchObject({
      fromLocationId: null,
      toLocationId: 'WH',
      reversesMovementId: 'M2',
    });
    expect(repository.netByLocation().get('WH')).toBe(6);
    await expect(service.reverse(first.id, correction, NOW)).rejects.toMatchObject({
      code: 'MOVEMENT_ALREADY_REVERSED',
    });
  });
});
