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

      await this.assertLocationExists(tx, request.locationCode);
      const unit = await this.lockOrCreateUnit(tx, request.serialNumber, request.sku);

      const event = await this.insertEvent(tx, unit, {
        type: request.type,
        occurredAt: new Date(request.occurredAt),
        locationCode: request.locationCode,
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
      const { event: target, unit } = found;

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
      if (request.replacement) {
        await this.assertLocationExists(tx, request.replacement.locationCode);
        replacement = await this.insertEvent(tx, unit, {
          type: request.replacement.type,
          occurredAt: new Date(request.replacement.occurredAt),
          locationCode: request.replacement.locationCode,
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
          ...this.toPayload(unit, target),
          reason: request.reason,
          replacementEventId: replacement?.id ?? null,
        }) satisfies UnitEventVoided,
      );
      if (replacement) await this.announce(tx, unit, replacement);

      await this.reproject(tx, unit.id);
      return { correctionId, replacementEventId: replacement?.id ?? null };
    });
  }

  /** 한 제품의 생애주기 전체. 정정으로 무효화된 사실도 정정 내역과 함께 보여 준다. */
  async lifecycle(serialNumber: string): Promise<UnitLifecycleView> {
    const [unit] = await this.db
      .select()
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    if (!unit) throw scmError('UNIT_NOT_FOUND', `Unit ${serialNumber} not found`);

    const rows = await this.db
      .select({ event: unitEvents, correction: unitEventCorrections })
      .from(unitEvents)
      .leftJoin(unitEventCorrections, eq(unitEventCorrections.targetEventId, unitEvents.id))
      .where(eq(unitEvents.unitId, unit.id))
      .orderBy(asc(unitEvents.occurredAt), asc(unitEvents.recordedAt), asc(unitEvents.id));

    return {
      serialNumber: unit.serialNumber,
      sku: unit.sku,
      status: unit.status,
      locationCode: unit.locationCode,
      orderRef: orderRefOf(unit),
      anomalies: unit.anomalies,
      events: rows.map(({ event, correction }) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        recordedAt: event.recordedAt.toISOString(),
        locationCode: event.locationCode,
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
        sku: units.sku,
        locationCode: units.locationCode,
        status: units.status,
        quantity: count(),
      })
      .from(units)
      .groupBy(units.sku, units.locationCode, units.status)
      .orderBy(asc(units.sku), asc(units.locationCode), asc(units.status));
  }

  async findSkuBySerial(serialNumber: string): Promise<string | undefined> {
    const [unit] = await this.db
      .select({ sku: units.sku })
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .limit(1);
    return unit?.sku;
  }

  private async assertLocationExists(tx: Tx, code: string | null) {
    if (!code) return;
    const [location] = await tx
      .select({ code: locations.code })
      .from(locations)
      .where(eq(locations.code, code))
      .limit(1);
    if (!location) throw scmError('UNKNOWN_LOCATION', `Unknown location ${code}`);
  }

  private async lockOrCreateUnit(tx: Tx, serialNumber: string, sku: string | undefined) {
    const [existing] = await tx
      .select()
      .from(units)
      .where(eq(units.serialNumber, serialNumber))
      .for('update');
    if (existing) {
      if (sku && sku !== existing.sku) {
        throw scmError(
          'SERIAL_SKU_MISMATCH',
          `Serial ${serialNumber} is registered as ${existing.sku}, not ${sku}`,
        );
      }
      return existing;
    }

    if (!sku) {
      throw scmError('SKU_REQUIRED', `sku is required for new serial ${serialNumber}`);
    }
    const [product] = await tx
      .select({ sku: products.sku })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);
    if (!product) throw scmError('UNKNOWN_SKU', `Unknown sku ${sku}`);

    const now = new Date();
    const unit: UnitRow = {
      id: newId(),
      serialNumber,
      sku,
      status: 'UNKNOWN',
      locationCode: null,
      orderId: null,
      fulfillmentItemId: null,
      anomalies: [],
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(units).values(unit);
    return unit;
  }

  private async insertEvent(
    tx: Tx,
    unit: UnitRow,
    input: Pick<
      UnitEventRow,
      | 'type'
      | 'occurredAt'
      | 'locationCode'
      | 'caseId'
      | 'sourceSystem'
      | 'sourceRef'
      | 'idempotencyKey'
      | 'note'
    > & { orderRef: OrderRef | null; announce?: boolean },
  ): Promise<UnitEventRow> {
    const { orderRef, announce = true, ...columns } = input;
    const event: UnitEventRow = {
      ...columns,
      id: newId(),
      unitId: unit.id,
      recordedAt: new Date(),
      orderId: orderRef?.orderId ?? null,
      fulfillmentItemId: orderRef?.fulfillmentItemId ?? null,
    };
    await tx.insert(unitEvents).values(event);
    if (announce) await this.announce(tx, unit, event);
    return event;
  }

  private async announce(tx: Tx, unit: UnitRow, event: UnitEventRow) {
    await enqueue(
      tx,
      Topics.scmUnitEvents,
      unit.serialNumber,
      makeEvent('scm.unit.event-recorded', this.toPayload(unit, event)) satisfies UnitEventRecorded,
    );
  }

  private toPayload(unit: UnitRow, event: UnitEventRow): UnitEventRecorded['payload'] {
    return {
      eventId: event.id,
      serialNumber: unit.serialNumber,
      sku: unit.sku,
      eventType: event.type,
      occurredAt: event.occurredAt.toISOString(),
      locationCode: event.locationCode,
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
        locationCode: unitEvents.locationCode,
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
        locationCode: state.locationCode,
        orderId: state.orderRef?.orderId ?? null,
        fulfillmentItemId: state.orderRef?.fulfillmentItemId ?? null,
        anomalies: state.anomalies,
        updatedAt: new Date(),
      })
      .where(eq(units.id, unitId));
  }
}
