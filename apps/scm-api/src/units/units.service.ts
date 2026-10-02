import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';

import { makeEvent, Topics, type OrderRef } from '@repo/contracts/common';
import type {
  CorrectUnitEventRequest,
  RecordUnitEventRequest,
  StockRow,
  UnitEventRecorded,
  UnitEventVoided,
  UnitLifecycleView,
} from '@repo/contracts/scm';
import { newId } from '@repo/db-kit/columns';
import { enqueue } from '@repo/db-kit/outbox';
import { DB } from '@repo/nest-kit/infra.module';

import type { Db, Tx } from '../db/db.js';
import { locations, products, unitEventCorrections, unitEvents, units } from '../db/schema.js';
import { scmError } from '../errors.js';
import { projectUnit } from './unit-projection.js';

type UnitRow = typeof units.$inferSelect;
type UnitEventRow = typeof unitEvents.$inferSelect;
/** 제품 행에 외부로 내보낼 때 쓰는 SKU 코드를 붙인 것. */
type UnitRef = UnitRow & { sku: string };
type LocationRef = { id: string; code: string };

const orderRefOf = (row: {
  orderId: string | null;
  fulfillmentItemId: string | null;
}): OrderRef | null =>
  row.orderId ? { orderId: row.orderId, fulfillmentItemId: row.fulfillmentItemId } : null;

@Injectable()
export class UnitsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 사실 한 건을 기록하고 제품의 현재 상태를 다시 계산한다. */
  async record(request: RecordUnitEventRequest): Promise<{ eventId: string; duplicate: boolean }> {
    return this.db.transaction(async (tx) => {
      if (request.idempotencyKey) {
        const [existing] = await tx
          .select({ id: unitEvents.id })
          .from(unitEvents)
          .where(eq(unitEvents.idempotencyKey, request.idempotencyKey))
          .limit(1);
        if (existing) return { eventId: existing.id, duplicate: true };
      }

      const location = await this.resolveLocation(tx, request.locationCode);
      const unit = await this.lockOrCreateUnit(tx, request.serialNumber, request.sku);

      const event = await this.insertEvent(tx, unit, {
        type: request.type,
        occurredAt: new Date(request.occurredAt),
        location,
        orderRef: request.orderRef,
        caseId: request.caseId,
        sourceSystem: request.source.system,
        sourceRef: request.source.ref,
        idempotencyKey: request.idempotencyKey ?? null,
        note: request.note,
      });
      await this.reproject(tx, unit.id);
      return { eventId: event.id, duplicate: false };
    });
  }

  /**
   * 잘못된 사실을 무효화하고(지우지 않는다) 필요하면 올바른 사실로 대체한다.
   * 대체 사실도 나중에 다시 정정할 수 있다.
   */
  async correct(
    eventId: string,
    request: CorrectUnitEventRequest,
  ): Promise<{ correctionId: string; replacementEventId: string | null }> {
    return this.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ event: unitEvents, unit: units })
        .from(unitEvents)
        .innerJoin(units, eq(units.id, unitEvents.unitId))
        .where(eq(unitEvents.id, eventId))
        .for('update');
      if (!found) throw scmError('UNIT_EVENT_NOT_FOUND', `Unit event ${eventId} not found`);
      const { event: target } = found;
      // 기준 정보는 잠그지 않는다. 같은 SKU·거점의 다른 제품 처리까지 직렬화되기 때문이다.
      const unit: UnitRef = { ...found.unit, sku: await this.skuOf(tx, found.unit.productId) };
      const targetLocationCode = await this.locationCodeOf(tx, target.locationId);

      const [already] = await tx
        .select({ id: unitEventCorrections.id })
        .from(unitEventCorrections)
        .where(eq(unitEventCorrections.targetEventId, eventId))
        .limit(1);
      if (already)
        throw scmError(
          'UNIT_EVENT_ALREADY_CORRECTED',
          `Unit event ${eventId} is already corrected`,
        );

      let replacement: UnitEventRow | null = null;
      let replacementLocation: LocationRef | null = null;
      if (request.replacement) {
        replacementLocation = await this.resolveLocation(tx, request.replacement.locationCode);
        replacement = await this.insertEvent(tx, unit, {
          type: request.replacement.type,
          occurredAt: new Date(request.replacement.occurredAt),
          location: replacementLocation,
          orderRef: request.replacement.orderRef,
          caseId: target.caseId,
          sourceSystem: 'logistics-hub:correction',
          sourceRef: request.actor,
          idempotencyKey: null,
          note: null,
          announce: false,
        });
      }

      const correctionId = newId();
      await tx.insert(unitEventCorrections).values({
        id: correctionId,
        targetEventId: target.id,
        replacementEventId: replacement?.id ?? null,
        reason: request.reason,
        actor: request.actor,
        recordedAt: new Date(),
      });

      // 무효화를 먼저, 대체 사실을 나중에 알려야 소비 측이 순서대로 되돌리고 다시 적용할 수 있다.
      await enqueue(
        tx,
        Topics.scmUnitEvents,
        unit.serialNumber,
        makeEvent('scm.unit.event-voided', {
          ...this.toPayload(unit, target, targetLocationCode),
          reason: request.reason,
          replacementEventId: replacement?.id ?? null,
        }) satisfies UnitEventVoided,
      );
      if (replacement) {
        await this.announce(tx, unit, replacement, replacementLocation?.code ?? null);
      }

      await this.reproject(tx, unit.id);
      return { correctionId, replacementEventId: replacement?.id ?? null };
    });
  }

  /** 한 제품의 생애주기 전체. 정정으로 무효화된 사실도 정정 내역과 함께 보여 준다. */
  async lifecycle(serialNumber: string): Promise<UnitLifecycleView> {
    const [found] = await this.db
      .select({ unit: units, sku: products.sku, locationCode: locations.code })
      .from(units)
      .innerJoin(products, eq(products.id, units.productId))
      .leftJoin(locations, eq(locations.id, units.locationId))
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    if (!found) throw scmError('UNIT_NOT_FOUND', `Unit ${serialNumber} not found`);
    const { unit } = found;

    const rows = await this.db
      .select({ event: unitEvents, correction: unitEventCorrections, locationCode: locations.code })
      .from(unitEvents)
      .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
      .leftJoin(locations, eq(locations.id, unitEvents.locationId))
      .where(eq(unitEvents.unitId, unit.id))
      .orderBy(asc(unitEvents.occurredAt), asc(unitEvents.recordedAt), asc(unitEvents.id));

    return {
      serialNumber: unit.serialNumber,
      sku: found.sku,
      status: unit.status,
      locationCode: found.locationCode,
      orderRef: orderRefOf(unit),
      anomalies: unit.anomalies,
      events: rows.map(({ event, correction, locationCode }) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        recordedAt: event.recordedAt.toISOString(),
        locationCode,
        orderRef: orderRefOf(event),
        caseId: event.caseId,
        source: { system: event.sourceSystem, ref: event.sourceRef },
        note: event.note,
        correction: correction && {
          id: correction.id,
          reason: correction.reason,
          actor: correction.actor,
          recordedAt: correction.recordedAt.toISOString(),
          replacementEventId: correction.replacementEventId,
        },
      })),
    };
  }

  /** SKU × 거점 × 상태별 수량. 정정이 반영된 "우리가 믿는" 재고다. */
  async stock(): Promise<StockRow[]> {
    return this.db
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

  async findSkuBySerial(serialNumber: string): Promise<string | undefined> {
    const [unit] = await this.db
      .select({ sku: products.sku })
      .from(units)
      .innerJoin(products, eq(products.id, units.productId))
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    return unit?.sku;
  }

  /** 거점 코드를 내부 id 로 바꾼다. 코드가 없으면(null) 거점 없는 사실이다. */
  private async resolveLocation(tx: Tx, code: string | null): Promise<LocationRef | null> {
    if (!code) return null;
    const [location] = await tx
      .select({ id: locations.id, code: locations.code })
      .from(locations)
      .where(eq(locations.code, code))
      .limit(1);
    if (!location) throw scmError('UNKNOWN_LOCATION', `Unknown location ${code}`);
    return location;
  }

  private async locationCodeOf(tx: Tx, locationId: string | null): Promise<string | null> {
    if (!locationId) return null;
    const [location] = await tx
      .select({ code: locations.code })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    return location?.code ?? null;
  }

  private async skuOf(tx: Tx, productId: string): Promise<string> {
    const [product] = await tx
      .select({ sku: products.sku })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new Error(`Product ${productId} referenced by a unit does not exist`);
    return product.sku;
  }

  private async lockOrCreateUnit(
    tx: Tx,
    serialNumber: string,
    sku: string | undefined,
  ): Promise<UnitRef> {
    const [existing] = await tx
      .select()
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .for('update');
    if (existing) {
      const existingSku = await this.skuOf(tx, existing.productId);
      if (sku && sku !== existingSku) {
        throw scmError(
          'SERIAL_SKU_MISMATCH',
          `Serial ${serialNumber} is registered as ${existingSku}, not ${sku}`,
        );
      }
      return { ...existing, sku: existingSku };
    }

    if (!sku) {
      throw scmError('SKU_REQUIRED', `sku is required for new serial ${serialNumber}`);
    }
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    if (!product) throw scmError('UNKNOWN_SKU', `Unknown sku ${sku}`);

    const now = new Date();
    const unit: UnitRow = {
      id: newId(),
      serialNumber,
      productId: product.id,
      status: 'UNKNOWN',
      locationId: null,
      orderId: null,
      fulfillmentItemId: null,
      anomalies: [],
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(units).values(unit);
    return { ...unit, sku };
  }

  private async insertEvent(
    tx: Tx,
    unit: UnitRef,
    input: Pick<
      UnitEventRow,
      'type' | 'occurredAt' | 'caseId' | 'sourceSystem' | 'sourceRef' | 'idempotencyKey' | 'note'
    > & { location: LocationRef | null; orderRef: OrderRef | null; announce?: boolean },
  ): Promise<UnitEventRow> {
    const { location, orderRef, announce = true, ...columns } = input;
    const event: UnitEventRow = {
      ...columns,
      id: newId(),
      unitId: unit.id,
      recordedAt: new Date(),
      locationId: location?.id ?? null,
      orderId: orderRef?.orderId ?? null,
      fulfillmentItemId: orderRef?.fulfillmentItemId ?? null,
    };
    await tx.insert(unitEvents).values(event);
    if (announce) await this.announce(tx, unit, event, location?.code ?? null);
    return event;
  }

  private async announce(tx: Tx, unit: UnitRef, event: UnitEventRow, locationCode: string | null) {
    await enqueue(
      tx,
      Topics.scmUnitEvents,
      unit.serialNumber,
      makeEvent(
        'scm.unit.event-recorded',
        this.toPayload(unit, event, locationCode),
      ) satisfies UnitEventRecorded,
    );
  }

  private toPayload(
    unit: UnitRef,
    event: UnitEventRow,
    locationCode: string | null,
  ): UnitEventRecorded['payload'] {
    return {
      eventId: event.id,
      serialNumber: unit.serialNumber,
      sku: unit.sku,
      eventType: event.type,
      occurredAt: event.occurredAt.toISOString(),
      locationCode,
      // 배송 완료는 보통 택배사가 주문 정보 없이 보고한다. 출고 때 붙은 주문을 이어 붙인다.
      orderRef: orderRefOf(event) ?? (event.type === 'DELIVERED' ? orderRefOf(unit) : null),
      caseId: event.caseId,
    };
  }

  /** 정정되지 않은 사실만 모아 현재 상태를 다시 만든다. */
  private async reproject(tx: Tx, unitId: string) {
    const effective = await tx
      .select({
        id: unitEvents.id,
        type: unitEvents.type,
        occurredAt: unitEvents.occurredAt,
        recordedAt: unitEvents.recordedAt,
        locationId: unitEvents.locationId,
        orderId: unitEvents.orderId,
        fulfillmentItemId: unitEvents.fulfillmentItemId,
      })
      .from(unitEvents)
      .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
      .where(and(eq(unitEvents.unitId, unitId), isNull(unitEventCorrections.id)));

    const state = projectUnit(effective.map((e) => ({ ...e, orderRef: orderRefOf(e) })));
    await tx
      .update(units)
      .set({
        status: state.status,
        locationId: state.locationId,
        orderId: state.orderRef?.orderId ?? null,
        fulfillmentItemId: state.orderRef?.fulfillmentItemId ?? null,
        anomalies: state.anomalies,
        updatedAt: new Date(),
      })
      .where(eq(units.id, unitId));
  }
}
