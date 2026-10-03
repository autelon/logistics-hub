import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';

import type { OrderRef } from '@repo/contracts/common';
import { newId } from '@repo/db-kit/columns';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import {
  locations,
  products,
  unitEventCorrections,
  unitEvents,
  units,
} from '../../../db/schema.js';
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

  async createUnit(unit: Omit<Unit, 'id'>): Promise<Unit> {
    const { orderRef, ...columns } = unit;
    const row: UnitRow = { ...columns, id: newId(), ...orderColumns(orderRef) };
    await this.db.get().insert(units).values(row);
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
        anomalies: state.anomalies,
        updatedAt,
      })
      .where(eq(units.id, unitId));
  }

  async addEvent(event: Omit<UnitEvent, 'id'>): Promise<UnitEvent> {
    const { orderRef, source, ...columns } = event;
    const row: UnitEventRow = {
      ...columns,
      id: newId(),
      ...orderColumns(orderRef),
      sourceSystem: source.system,
      sourceRef: source.ref,
    };
    await this.db.get().insert(unitEvents).values(row);
    return toEvent(row);
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
    return this.db
      .get()
      .select({
        sku: products.sku,
        locationCode: locations.code,
        status: units.status,
        quantity: count(),
      })
      .from(units)
      .innerJoin(products, eq(products.id, units.productId))
      .leftJoin(locations, eq(locations.id, units.locationId))
      .groupBy(products.sku, locations.code, units.status)
      .orderBy(asc(products.sku), asc(locations.code), asc(units.status));
  }
}
