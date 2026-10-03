import { describe, expect, it } from 'vitest';

import type { AsCaseMessage } from '@repo/contracts/as';
import type { EventOutbox } from '@repo/nest-kit/event-outbox';
import type { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import type { Location, Product } from '../domains/catalog/domain/catalog.js';
import type { CatalogRepository } from '../domains/catalog/domain/catalog.repository.js';
import { UnitService } from '../domains/unit/application/unit.service.js';
import type { UnitState } from '../domains/unit/domain/unit-projection.js';
import type { Unit, UnitEvent, UnitEventCorrection } from '../domains/unit/domain/unit.js';
import type { UnitRepository } from '../domains/unit/domain/unit.repository.js';
import { ApplyAsCaseEventUsecase } from './apply-as-case-event.usecase.js';

// ---------- 메모리 구현 ----------

const product: Product = { id: 'P1', sku: 'CAM-01', name: '카메라', createdAt: new Date() };

const catalogRepository: CatalogRepository = {
  upsertProduct: () => Promise.resolve(),
  listProducts: () => Promise.resolve([product]),
  findProductBySku: (sku) => Promise.resolve(sku === product.sku ? product : undefined),
  findProductById: (id) => Promise.resolve(id === product.id ? product : undefined),
  upsertLocation: () => Promise.resolve(),
  listLocations: (): Promise<Location[]> => Promise.resolve([]),
  findLocationByCode: () => Promise.resolve(undefined),
  findLocationById: () => Promise.resolve(undefined),
};

class MemoryUnitRepository implements UnitRepository {
  units: Unit[] = [];
  events: UnitEvent[] = [];
  corrections: UnitEventCorrection[] = [];
  private seq = 0;

  findBySerial(serialNumber: string) {
    return Promise.resolve(this.units.find((u) => u.serialNumber === serialNumber));
  }
  findBySerialForUpdate(serialNumber: string) {
    return this.findBySerial(serialNumber);
  }
  createUnit(unit: Omit<Unit, 'id'>) {
    const saved = { ...unit, id: `U${++this.seq}` };
    this.units.push(saved);
    return Promise.resolve(saved);
  }
  updateState(unitId: string, state: UnitState, updatedAt: Date) {
    const unit = this.units.find((u) => u.id === unitId);
    if (unit) Object.assign(unit, state, { updatedAt });
    return Promise.resolve();
  }
  addEvent(event: Omit<UnitEvent, 'id'>) {
    const saved = { ...event, id: `E${++this.seq}` };
    this.events.push(saved);
    return Promise.resolve(saved);
  }
  findEventByIdempotencyKey(idempotencyKey: string) {
    return Promise.resolve(this.events.find((e) => e.idempotencyKey === idempotencyKey));
  }
  findEventWithUnitForUpdate(eventId: string) {
    const event = this.events.find((e) => e.id === eventId);
    const unit = event && this.units.find((u) => u.id === event.unitId);
    return Promise.resolve(event && unit ? { event, unit } : undefined);
  }
  listEffectiveEvents(unitId: string) {
    return Promise.resolve(
      this.events.filter(
        (e) => e.unitId === unitId && !this.corrections.some((c) => c.targetEventId === e.id),
      ),
    );
  }
  addCorrection(correction: Omit<UnitEventCorrection, 'id'>) {
    const saved = { ...correction, id: `C${++this.seq}` };
    this.corrections.push(saved);
    return Promise.resolve(saved);
  }
  findCorrectionByTarget(targetEventId: string) {
    return Promise.resolve(this.corrections.find((c) => c.targetEventId === targetEventId));
  }
  findLifecycle() {
    return Promise.resolve(undefined);
  }
  countStock() {
    return Promise.resolve([]);
  }
}

const setup = () => {
  const units = new MemoryUnitRepository();
  const outbox: { topic: string; key: string; event: unknown }[] = [];
  const outboxPort: EventOutbox = {
    enqueue: (topic, key, event) => {
      outbox.push({ topic, key, event });
      return Promise.resolve();
    },
  };
  const tx: TransactionRunner = { run: (work) => work() };
  const usecase = new ApplyAsCaseEventUsecase(
    tx,
    new CatalogService(catalogRepository),
    new UnitService(units, outboxPort),
  );
  return { units, outbox, usecase };
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
    const { units, outbox, usecase } = setup();
    const now = new Date('2026-02-01T00:00:00.000Z');
    await units.createUnit({
      serialNumber: 'SN-1',
      productId: product.id,
      status: 'DELIVERED',
      locationId: null,
      orderRef: { orderId: 'O-1', fulfillmentItemId: null },
      anomalies: [],
      createdAt: now,
      updatedAt: now,
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

  it('같은 메시지가 다시 오면 아무것도 하지 않는다', async () => {
    const { units, outbox, usecase } = setup();
    const now = new Date();
    await units.createUnit({
      serialNumber: 'SN-1',
      productId: product.id,
      status: 'DELIVERED',
      locationId: null,
      orderRef: null,
      anomalies: [],
      createdAt: now,
      updatedAt: now,
    });

    await usecase.execute(doaConfirmed);
    expect(await usecase.execute(doaConfirmed)).toBe('duplicate');

    expect(units.events).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  it('모르는 시리얼이면 기록하지 않는다', async () => {
    const { units, outbox, usecase } = setup();

    expect(await usecase.execute(doaConfirmed)).toBe('unknown-serial');

    expect(units.units).toHaveLength(0);
    expect(units.events).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });
});
