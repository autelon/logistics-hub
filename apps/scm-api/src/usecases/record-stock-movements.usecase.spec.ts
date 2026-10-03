import { describe, expect, it, vi } from 'vitest';

import type { RecordStockMovementsRequest } from '@repo/contracts/scm';

import { WarehouseService } from '../domains/warehouse/application/warehouse.service.js';
import { StockMovementConflict } from '../domains/warehouse/domain/stock-movement-conflict.js';
import {
  MemoryStockMovementRepository,
  product,
  setupMemory,
} from '../testing/memory-repositories.js';
import { RecordStockMovementsUsecase } from './record-stock-movements.usecase.js';
import { MAX_ATTEMPTS } from './retry-on-conflict.js';

const item = (idempotencyKey: string | undefined, quantity = 5) => ({
  sku: 'BAT-01',
  lotNo: null,
  fromLocationCode: null,
  toLocationCode: 'WH-A',
  quantity,
  stockStatus: 'AVAILABLE' as const,
  reason: 'GOODS_RECEIPT' as const,
  occurredAt: '2026-10-01T00:00:00.000Z',
  source: { system: 'wms-a', ref: null },
  idempotencyKey,
  note: null,
});

const request = (...keys: (string | undefined)[]): RecordStockMovementsRequest => ({
  movements: keys.map((key) => item(key)),
});

const setup = () => {
  const memory = setupMemory([product({ id: 'P2', sku: 'BAT-01', trackingMode: 'NONE' })]);
  memory.catalogRepository.locations = [
    { id: 'L1', code: 'WH-A', name: 'a', type: 'WAREHOUSE', partner: 'p', createdAt: new Date() },
  ];
  const movements = new MemoryStockMovementRepository();
  const usecase = new RecordStockMovementsUsecase(
    memory.tx,
    memory.catalog,
    new WarehouseService(movements),
  );
  return { movements, usecase };
};

const conflict = () => new StockMovementConflict(new Error('ER_DUP_ENTRY'));

describe('RecordStockMovementsUsecase 의 동시 중복', () => {
  it('같은 키의 요청에게 지면 처음부터 다시 해서 이긴 쪽의 이동을 가리키며 중복으로 돌려준다', async () => {
    const { movements, usecase } = setup();
    const insert = movements.insertAll.bind(movements);
    let winnerId = '';
    // 진 쪽의 INSERT 가 막혀 있는 동안 이긴 쪽이 같은 키를 커밋한 것처럼 넣고 충돌을 던진다.
    vi.spyOn(movements, 'insertAll').mockImplementationOnce(async (items) => {
      winnerId = (await insert(items.slice(0, 1)))[0]?.id ?? '';
      throw conflict();
    });

    const result = await usecase.execute(request('k1'));

    expect(result.movements).toEqual([{ movementId: winnerId, duplicate: true }]);
    expect(movements.movements).toHaveLength(1);
  });

  it('여러 항목 중 일부만 겹쳐도 요청 전체를 다시 해서 겹친 것은 중복, 나머지는 새로 기록한다', async () => {
    const { movements, usecase } = setup();
    const insert = movements.insertAll.bind(movements);
    let winnerId = '';
    // 이긴 요청은 k2 만 먼저 커밋했다. 진 쪽의 k1·k2·k3 INSERT 는 통째로 롤백된다.
    vi.spyOn(movements, 'insertAll').mockImplementationOnce(async (items) => {
      winnerId = (await insert(items.filter((m) => m.idempotencyKey === 'k2')))[0]?.id ?? '';
      throw conflict();
    });

    const result = await usecase.execute(request('k1', 'k2', 'k3'));

    expect(result.movements.map((m) => m.duplicate)).toEqual([false, true, false]);
    expect(result.movements[1]?.movementId).toBe(winnerId);
    expect(movements.movements.map((m) => m.idempotencyKey)).toEqual(['k2', 'k1', 'k3']);
  });

  it('계속 지면 시도를 다 쓰고 에러를 그대로 던진다 (무한히 다시 하지 않는다)', async () => {
    const { movements, usecase } = setup();
    const spy = vi.spyOn(movements, 'insertAll').mockRejectedValue(conflict());

    await expect(usecase.execute(request('k1'))).rejects.toBeInstanceOf(StockMovementConflict);
    expect(spy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('고유 키 위반이 아닌 에러는 다시 하지 않는다', async () => {
    const { movements, usecase } = setup();
    const spy = vi.spyOn(movements, 'insertAll').mockRejectedValue(new Error('connection lost'));

    await expect(usecase.execute(request('k1'))).rejects.toThrow('connection lost');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
