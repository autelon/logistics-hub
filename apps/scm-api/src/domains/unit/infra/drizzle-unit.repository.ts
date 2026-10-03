import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { OrderRef } from '@repo/contracts/common';
import { newId } from '@repo/db-kit/columns';
import { isDeadlock, isDuplicateKeyOn } from '@repo/db-kit/errors';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import {
  locations,
  products,
  unitEventCorrections,
  unitEvents,
  units,
} from '../../../db/schema.js';
import { UnitConflict } from '../domain/unit-conflict.js';
import type { UnitState } from '../domain/unit-projection.js';
import type {
  StockCount,
  Unit,
  UnitEvent,
  UnitEventCorrection,
  UnitLifecycle,
} from '../domain/unit.js';
import type { UnitRepository } from '../domain/unit.repository.js';

type UnitRow = typeof units.$inferSelect;
type UnitEventRow = typeof unitEvents.$inferSelect;
type CorrectionRow = typeof unitEventCorrections.$inferSelect;

const orderRefOf = (row: {
  orderId: string | null;
  fulfillmentItemId: string | null;
}): OrderRef | null =>
  row.orderId ? { orderId: row.orderId, fulfillmentItemId: row.fulfillmentItemId } : null;

const orderColumns = (orderRef: OrderRef | null) => ({
  orderId: orderRef?.orderId ?? null,
  fulfillmentItemId: orderRef?.fulfillmentItemId ?? null,
});

const toUnit = ({ orderId, fulfillmentItemId, ...row }: UnitRow): Unit => ({
  ...row,
  orderRef: orderRefOf({ orderId, fulfillmentItemId }),
});

const toEvent = ({
  orderId,
  fulfillmentItemId,
  sourceSystem,
  sourceRef,
  ...row
}: UnitEventRow): UnitEvent => ({
  ...row,
  orderRef: orderRefOf({ orderId, fulfillmentItemId }),
  source: { system: sourceSystem, ref: sourceRef },
});

const toCorrection = (row: CorrectionRow): UnitEventCorrection => row;

/**
 * 시리얼 INSERT 가 같은 시리얼의 첫 보고와 동시에 처리되다 진 것을 알아본다: 시리얼의 고유 키 위반이나 그 틈에서 난 교착.
 * 그 밖의 에러(다른 고유 키 위반 포함)는 그대로 돌려준다.
 */
const unitInsertFailure = (error: unknown): unknown => {
  if (isDuplicateKeyOn(error, units.serialNumber.uniqueName)) {
    return new UnitConflict('serialNumber', error);
  }
  if (isDeadlock(error)) return new UnitConflict('deadlock', error);
  return error;
};

/** 사실 INSERT 가 같은 idempotencyKey 의 보고와 동시에 처리되다 진 것을 알아본다. 다른 고유 키 위반은 그대로 돌려준다. */
const eventInsertFailure = (error: unknown): unknown =>
  isDuplicateKeyOn(error, unitEvents.idempotencyKey.uniqueName)
    ? new UnitConflict('idempotencyKey', error)
    : error;

/** IN 절과 다중 행 INSERT 의 한 번 크기. 너무 크면 패킷·플랜이 부담스러워진다. */
const CHUNK = 500;

const chunked = <T>(items: readonly T[]): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks;
};

const eventRow = (event: Omit<UnitEvent, 'id'>): UnitEventRow => {
  const { orderRef, source, ...columns } = event;
  return {
    ...columns,
    id: newId(),
    ...orderColumns(orderRef),
    sourceSystem: source.system,
    sourceRef: source.ref,
  };
};

@Injectable()
export class DrizzleUnitRepository implements UnitRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async findBySerial(serialNumber: string): Promise<Unit | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    return row && toUnit(row);
  }

  async findBySerialForUpdate(serialNumber: string): Promise<Unit | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .for('update');
    return row && toUnit(row);
  }

  async findBySerialsForUpdate(serialNumbers: readonly string[]): Promise<Unit[]> {
    // 시리얼 순으로 잠가야 겹치는 목록을 동시에 등록하는 두 트랜잭션이 서로를 기다리며 멈추지 않는다.
    const sorted = serialNumbers.toSorted();
    const found: Unit[] = [];
    for (const chunk of chunked(sorted)) {
      const rows = await this.db
        .get()
        .select()
        .from(units)
        .where(inArray(units.serialNumber, chunk))
        .orderBy(asc(units.serialNumber))
        .for('update');
      found.push(...rows.map(toUnit));
    }
    return found;
  }

  async createUnit(unit: Omit<Unit, 'id'>): Promise<Unit> {
    const { orderRef, ...columns } = unit;
    const row: UnitRow = { ...columns, id: newId(), ...orderColumns(orderRef) };
    try {
      await this.db.get().insert(units).values(row);
    } catch (error) {
      throw unitInsertFailure(error);
    }
    return toUnit(row);
  }

  async updateState(unitId: string, state: UnitState, updatedAt: Date): Promise<void> {
    await this.db
      .get()
      .update(units)
      .set({
        status: state.status,
        locationId: state.locationId,
        ...orderColumns(state.orderRef),
        registeredAt: state.registeredAt,
        anomalies: state.anomalies,
        updatedAt,
      })
      .where(eq(units.id, unitId));
  }

  async addEvent(event: Omit<UnitEvent, 'id'>): Promise<UnitEvent> {
    const row = eventRow(event);
    try {
      await this.db.get().insert(unitEvents).values(row);
    } catch (error) {
      throw eventInsertFailure(error);
    }
    return toEvent(row);
  }

  async addEvents(events: readonly Omit<UnitEvent, 'id'>[]): Promise<UnitEvent[]> {
    const rows = events.map(eventRow);
    for (const chunk of chunked(rows)) {
      await this.db.get().insert(unitEvents).values(chunk);
    }
    return rows.map(toEvent);
  }

  async findEventByIdempotencyKey(idempotencyKey: string): Promise<UnitEvent | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(unitEvents)
      .where(eq(unitEvents.idempotencyKey, idempotencyKey))
      .limit(1);
    return row && toEvent(row);
  }

  async findEventWithUnitForUpdate(
    eventId: string,
  ): Promise<{ event: UnitEvent; unit: Unit } | undefined> {
    const [found] = await this.db
      .get()
      .select({ event: unitEvents, unit: units })
      .from(unitEvents)
      .innerJoin(units, eq(units.id, unitEvents.unitId))
      .where(eq(unitEvents.id, eventId))
      .for('update');
    return found && { event: toEvent(found.event), unit: toUnit(found.unit) };
  }

  async listEffectiveEvents(unitId: string): Promise<UnitEvent[]> {
    const rows = await this.db
      .get()
      .select({ event: unitEvents })
      .from(unitEvents)
      .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
      .where(and(eq(unitEvents.unitId, unitId), isNull(unitEventCorrections.id)));
    return rows.map((r) => toEvent(r.event));
  }

  async listEffectiveEventsOf(unitIds: readonly string[]): Promise<UnitEvent[]> {
    const events: UnitEvent[] = [];
    for (const chunk of chunked(unitIds)) {
      const rows = await this.db
        .get()
        .select({ event: unitEvents })
        .from(unitEvents)
        .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
        .where(and(inArray(unitEvents.unitId, chunk), isNull(unitEventCorrections.id)));
      events.push(...rows.map((r) => toEvent(r.event)));
    }
    return events;
  }

  async addCorrection(correction: Omit<UnitEventCorrection, 'id'>): Promise<UnitEventCorrection> {
    const row: CorrectionRow = { ...correction, id: newId() };
    await this.db.get().insert(unitEventCorrections).values(row);
    return toCorrection(row);
  }

  async findCorrectionByTarget(targetEventId: string): Promise<UnitEventCorrection | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(unitEventCorrections)
      .where(eq(unitEventCorrections.targetEventId, targetEventId))
      .limit(1);
    return row && toCorrection(row);
  }

  /** 읽기 모델. 응답에 보여 줄 코드(sku, 거점 코드)는 catalog 테이블을 조인해 채운다. */
  async findLifecycle(serialNumber: string): Promise<UnitLifecycle | undefined> {
    const db = this.db.get();
    const [found] = await db
      .select({ unit: units, sku: products.sku, locationCode: locations.code })
      .from(units)
      .innerJoin(products, eq(products.id, units.productId))
      .leftJoin(locations, eq(locations.id, units.locationId))
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    if (!found) return undefined;

    const rows = await db
      .select({ event: unitEvents, correction: unitEventCorrections, locationCode: locations.code })
      .from(unitEvents)
      .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
      .leftJoin(locations, eq(locations.id, unitEvents.locationId))
      .where(eq(unitEvents.unitId, found.unit.id))
      .orderBy(asc(unitEvents.occurredAt), asc(unitEvents.recordedAt), asc(unitEvents.id));

    return {
      unit: toUnit(found.unit),
      sku: found.sku,
      locationCode: found.locationCode,
      events: rows.map(({ event, correction, locationCode }) => ({
        event: toEvent(event),
        locationCode,
        correction: correction && toCorrection(correction),
      })),
    };
  }

  countStock(): Promise<StockCount[]> {
    // MySQL 은 불리언 식을 0/1 로 돌려준다.
    const registered = sql<boolean>`${units.registeredAt} is not null`.mapWith(Boolean);
    return this.db
      .get()
      .select({
        sku: products.sku,
        locationCode: locations.code,
        status: units.status,
        registered,
        quantity: count(),
      })
      .from(units)
      .innerJoin(products, eq(products.id, units.productId))
      .leftJoin(locations, eq(locations.id, units.locationId))
      .groupBy(products.sku, locations.code, units.status, registered)
      .orderBy(
        asc(products.sku),
        asc(locations.code),
        asc(units.status),
        asc(sql`${units.registeredAt} is not null`),
      );
  }

  async createUnits(newUnits: readonly Omit<Unit, 'id'>[]): Promise<Unit[]> {
    const rows = newUnits.map(({ orderRef, ...columns }): UnitRow => {
      return { ...columns, id: newId(), ...orderColumns(orderRef) };
    });
    for (const chunk of chunked(rows)) {
      await this.db.get().insert(units).values(chunk);
    }
    return rows.map(toUnit);
  }
}
