import type { DeviceRequestNotification } from '@repo/contracts/scm';
import type { EventOutbox } from '@repo/nest-kit/event-outbox';
import type { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import type { Location, Product } from '../domains/catalog/domain/catalog.js';
import type { CatalogRepository } from '../domains/catalog/domain/catalog.repository.js';
import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import type {
  DeviceRequest,
  DeviceRequestCounts,
  DeviceRequestItem,
  ItemResultReport,
  NewDeviceRequest,
} from '../domains/device-request/domain/device-request.js';
import type { DeviceRequestRepository } from '../domains/device-request/domain/device-request.repository.js';
import type { DeviceServerGateway } from '../domains/device-request/domain/device-server.gateway.js';
import { UnitService } from '../domains/unit/application/unit.service.js';
import { projectUnit, type UnitState } from '../domains/unit/domain/unit-projection.js';
import type { Unit, UnitEvent, UnitEventCorrection } from '../domains/unit/domain/unit.js';
import type { UnitRepository } from '../domains/unit/domain/unit.repository.js';
import {
  ledgerEntries,
  type NewStockMovement,
  type StockMovement,
} from '../domains/warehouse/domain/stock-movement.js';
import type { StockMovementRepository } from '../domains/warehouse/domain/stock-movement.repository.js';

// 단위 테스트용 메모리 구현. DB 없이 application 서비스와 usecase 를 돌린다 (docs/testing.md).
// 빌드에는 들어가지 않는다 (tsconfig.build.json).

export class MemoryCatalogRepository implements CatalogRepository {
  products: Product[] = [];
  locations: Location[] = [];

  upsertProduct() {
    return Promise.resolve();
  }
  listProducts() {
    return Promise.resolve(this.products);
  }
  findProductBySku(sku: string) {
    return Promise.resolve(this.products.find((p) => p.sku === sku));
  }
  findProductsBySkus(skus: readonly string[]) {
    return Promise.resolve(this.products.filter((p) => skus.includes(p.sku)));
  }
  findProductById(id: string) {
    return Promise.resolve(this.products.find((p) => p.id === id));
  }
  findProductsByIds(ids: readonly string[]) {
    return Promise.resolve(this.products.filter((p) => ids.includes(p.id)));
  }
  upsertLocation() {
    return Promise.resolve();
  }
  listLocations(): Promise<Location[]> {
    return Promise.resolve([]);
  }
  findLocationByCode() {
    return Promise.resolve(undefined);
  }
  findLocationByCodeForUpdate() {
    return Promise.resolve(undefined);
  }
  findLocationsByCodes(codes: readonly string[]): Promise<Location[]> {
    return Promise.resolve(this.locations.filter((l) => codes.includes(l.code)));
  }
  findLocationById() {
    return Promise.resolve(undefined);
  }
}

export class MemoryUnitRepository implements UnitRepository {
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
  findBySerialsForUpdate(serialNumbers: readonly string[]) {
    return Promise.resolve(this.units.filter((u) => serialNumbers.includes(u.serialNumber)));
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
  addEvents(events: readonly Omit<UnitEvent, 'id'>[]) {
    return Promise.all(events.map((event) => this.addEvent(event)));
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
    return this.listEffectiveEventsOf([unitId]);
  }
  listEffectiveEventsOf(unitIds: readonly string[]) {
    return Promise.resolve(
      this.events.filter(
        (e) =>
          unitIds.includes(e.unitId) && !this.corrections.some((c) => c.targetEventId === e.id),
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

export class MemoryStockMovementRepository implements StockMovementRepository {
  movements: StockMovement[] = [];
  private seq = 0;

  insertAll(movements: readonly NewStockMovement[]) {
    const saved = movements.map((movement) => ({ ...movement, id: `M${++this.seq}` }));
    this.movements.push(...saved);
    return Promise.resolve(saved);
  }
  findIdsByIdempotencyKeys(keys: readonly string[]) {
    const found = new Map<string, string>();
    for (const movement of this.movements) {
      if (movement.idempotencyKey && keys.includes(movement.idempotencyKey)) {
        found.set(movement.idempotencyKey, movement.id);
      }
    }
    return Promise.resolve(found);
  }
  findByIdForUpdate(id: string) {
    return Promise.resolve(this.movements.find((m) => m.id === id));
  }
  findReversalOf(id: string) {
    return Promise.resolve(this.movements.find((m) => m.reversesMovementId === id));
  }
  /** 코드를 조인한 합산은 SQL 로만 하므로 메모리 구현은 비워 둔다 (플레이북으로 확인). 거점별 순변화는 `netByLocation`. */
  balances() {
    return Promise.resolve([]);
  }
  /** 거점 id → 순변화 (`ledgerEntries` 로 푼 합). 0 인 거점도 포함한다. */
  netByLocation(): Map<string, number> {
    const net = new Map<string, number>();
    for (const movement of this.movements) {
      for (const { locationId, delta } of ledgerEntries(movement)) {
        net.set(locationId, (net.get(locationId) ?? 0) + delta);
      }
    }
    return net;
  }
}

export class MemoryDeviceRequestRepository implements DeviceRequestRepository {
  requests: DeviceRequest[] = [];
  items: DeviceRequestItem[] = [];
  private seq = 0;

  create(draft: NewDeviceRequest) {
    const request: DeviceRequest = {
      id: `R${++this.seq}`,
      type: draft.type,
      reason: draft.reason,
      createdBy: draft.createdBy,
      createdAt: new Date(),
      notifiedAt: null,
    };
    this.requests.push(request);
    for (const item of draft.items) {
      // 실제 저장소의 UUIDv7 처럼 만든 순서대로 정렬되는 id.
      this.items.push({
        ...item,
        id: `I${String(++this.seq).padStart(6, '0')}`,
        requestId: request.id,
        result: 'PENDING',
        resultReason: null,
        resultAt: null,
      });
    }
    return Promise.resolve(request);
  }
  findById(id: string) {
    return Promise.resolve(this.requests.find((r) => r.id === id));
  }
  markNotified(id: string, at: Date) {
    const request = this.requests.find((r) => r.id === id);
    if (request && !request.notifiedAt) request.notifiedAt = at;
    return Promise.resolve();
  }
  listRecent(limit: number) {
    return Promise.all(
      this.requests
        .toReversed()
        .slice(0, limit)
        .map(async (request) => ({ request, counts: await this.countsOf(request.id) })),
    );
  }
  countsOf(requestId: string): Promise<DeviceRequestCounts> {
    const items = this.items.filter((i) => i.requestId === requestId);
    return Promise.resolve({
      total: items.length,
      pending: items.filter((i) => i.result === 'PENDING').length,
      succeeded: items.filter((i) => i.result === 'SUCCEEDED').length,
      failed: items.filter((i) => i.result === 'FAILED').length,
    });
  }
  listItems(requestId: string, afterItemId: string | undefined, limit: number) {
    return Promise.resolve(
      this.items
        .filter((i) => i.requestId === requestId && (!afterItemId || i.id > afterItemId))
        .toSorted((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit),
    );
  }
  listFailedItems(requestId: string, limit: number) {
    return Promise.resolve(
      this.items.filter((i) => i.requestId === requestId && i.result === 'FAILED').slice(0, limit),
    );
  }
  findSerials(requestId: string, serialNumbers: readonly string[]) {
    return Promise.resolve(
      this.items
        .filter((i) => i.requestId === requestId && serialNumbers.includes(i.serialNumber))
        .map((i) => i.serialNumber),
    );
  }
  recordResults(requestId: string, results: readonly ItemResultReport[], at: Date) {
    for (const report of results) {
      const item = this.items.find(
        (i) => i.requestId === requestId && i.serialNumber === report.serialNumber,
      );
      if (item)
        Object.assign(item, { result: report.result, resultReason: report.reason, resultAt: at });
    }
    return Promise.resolve();
  }
}

export class FakeDeviceServer implements DeviceServerGateway {
  notifications: DeviceRequestNotification[] = [];
  /** 참이면 알림이 실패한다 (기기 서버가 내려가 있는 경우). */
  down = false;

  notify(notification: DeviceRequestNotification) {
    if (this.down) return Promise.reject(new Error('device server is down'));
    this.notifications.push(notification);
    return Promise.resolve();
  }
}

export const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'P1',
  sku: 'CAM-01',
  name: '카메라',
  trackingMode: 'SERIAL',
  createdAt: new Date(),
  ...overrides,
});

/** 서비스와 메모리 저장소를 한 벌로 묶는다. 아웃박스에 적힌 이벤트는 `outbox` 에 쌓인다. */
export const setupMemory = (products: Product[] = [product()]) => {
  const catalogRepository = new MemoryCatalogRepository();
  catalogRepository.products = products;
  const unitRepository = new MemoryUnitRepository();
  const deviceRequestRepository = new MemoryDeviceRequestRepository();
  const deviceServer = new FakeDeviceServer();

  const outbox: { topic: string; key: string; event: unknown }[] = [];
  const outboxPort: EventOutbox = {
    enqueue: (topic, key, event) => {
      outbox.push({ topic, key, event });
      return Promise.resolve();
    },
  };
  const tx: TransactionRunner = { run: (work) => work() };

  return {
    catalogRepository,
    unitRepository,
    deviceRequestRepository,
    deviceServer,
    outbox,
    tx,
    catalog: new CatalogService(catalogRepository),
    units: new UnitService(unitRepository, outboxPort),
    deviceRequests: new DeviceRequestService(deviceRequestRepository, deviceServer, outboxPort),
  };
};

/** 상태 캐시만 채운 제품을 바로 만든다 (사실 없이). */
export const seedUnit = (
  repository: MemoryUnitRepository,
  serialNumber: string,
  overrides: Partial<Omit<Unit, 'id' | 'serialNumber'>> = {},
) => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  return repository.createUnit({
    serialNumber,
    productId: 'P1',
    status: 'IN_STOCK',
    locationId: null,
    orderRef: null,
    registeredAt: null,
    anomalies: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
};

/**
 * 제조 → 출발 → 입고 사실을 갖춘 IN_STOCK 제품. 상태 캐시가 사실과 일치해야 다시 접어도 같은 상태가 나온다.
 */
export const seedInStock = async (repository: MemoryUnitRepository, serialNumber: string) => {
  const unit = await seedUnit(repository, serialNumber);
  const days = [1, 2, 3];
  const types = ['MANUFACTURED', 'DISPATCHED', 'RECEIVED'] as const;
  for (const [i, type] of types.entries()) {
    const at = new Date(Date.UTC(2026, 0, days[i] ?? 1));
    await repository.addEvent({
      unitId: unit.id,
      type,
      occurredAt: at,
      recordedAt: at,
      locationId: type === 'DISPATCHED' ? null : 'L1',
      orderRef: null,
      caseId: null,
      source: { system: 'test', ref: null },
      idempotencyKey: null,
      note: null,
    });
  }
  const state = projectUnit(await repository.listEffectiveEvents(unit.id), {
    requiresRegistration: true,
  });
  await repository.updateState(unit.id, state, unit.updatedAt);
  return unit;
};
