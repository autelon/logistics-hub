import { Inject, Injectable } from '@nestjs/common';

import { makeEvent, Topics, type OrderRef } from '@repo/contracts/common';
import type { UnitEventRecorded, UnitEventType, UnitEventVoided } from '@repo/contracts/scm';
import { EventOutbox } from '@repo/nest-kit/event-outbox';

import { scmError } from '../../../errors.js';
import { projectUnit } from '../domain/unit-projection.js';
import type {
  LocationRef,
  NewUnitEvent,
  ProductRef,
  StockCount,
  Unit,
  UnitEvent,
  UnitLifecycle,
} from '../domain/unit.js';
import { UnitRepository } from '../domain/unit.repository.js';

/** 정정 대상. `lockForCorrection` 으로 잠근 사실에 usecase 가 catalog 에서 해석한 코드를 붙인 것. */
export interface CorrectionTarget {
  event: UnitEvent;
  unit: Unit;
  product: ProductRef;
  locationCode: string | null;
}

export interface Correction {
  reason: string;
  actor: string;
  replacement: {
    type: UnitEventType;
    occurredAt: Date;
    location: LocationRef | null;
    orderRef: OrderRef | null;
  } | null;
}

/**
 * 사실을 기록하고 제품의 현재 상태를 다시 계산하며, 다른 서비스에 알린다.
 *
 * 트랜잭션은 열지 않는다. usecase 가 `TransactionRunner.run` 으로 감싸고, 그 안에서
 * `lockBySerial`/`lockForCorrection` 으로 잠근 제품을 `record`/`correct` 에 넘긴다.
 */
@Injectable()
export class UnitService {
  constructor(
    @Inject(UnitRepository) private readonly units: UnitRepository,
    @Inject(EventOutbox) private readonly outbox: EventOutbox,
  ) {}

  findBySerial(serialNumber: string): Promise<Unit | undefined> {
    return this.units.findBySerial(serialNumber);
  }

  /** 같은 보고가 재전송된 것인지. 키가 없는 보고는 늘 새 사실이다. */
  async findDuplicate(idempotencyKey: string | undefined): Promise<UnitEvent | undefined> {
    if (!idempotencyKey) return undefined;
    return this.units.findEventByIdempotencyKey(idempotencyKey);
  }

  lockBySerial(serialNumber: string): Promise<Unit | undefined> {
    return this.units.findBySerialForUpdate(serialNumber);
  }

  /** 처음 보는 시리얼을 등록한다. 사실이 없으므로 상태는 UNKNOWN 이다. */
  register(serialNumber: string, product: ProductRef): Promise<Unit> {
    const now = new Date();
    return this.units.createUnit({
      serialNumber,
      productId: product.id,
      ...projectUnit([]),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** 사실 한 건을 기록하고 알린 뒤 제품의 현재 상태를 다시 계산한다. */
  async record(unit: Unit, product: ProductRef, fact: NewUnitEvent): Promise<UnitEvent> {
    const event = await this.insertEvent(unit, fact);
    await this.announce(unit, product, event, fact.location?.code ?? null);
    await this.reproject(unit.id);
    return event;
  }

  /** 정정할 사실과 그 제품을 잠근다. 이미 정정된 사실은 다시 정정할 수 없다. */
  async lockForCorrection(eventId: string): Promise<{ event: UnitEvent; unit: Unit }> {
    const found = await this.units.findEventWithUnitForUpdate(eventId);
    if (!found) throw scmError('UNIT_EVENT_NOT_FOUND', `Unit event ${eventId} not found`);
    if (await this.units.findCorrectionByTarget(eventId)) {
      throw scmError('UNIT_EVENT_ALREADY_CORRECTED', `Unit event ${eventId} is already corrected`);
    }
    return found;
  }

  /**
   * 잘못된 사실을 무효화하고(지우지 않는다) 필요하면 올바른 사실로 대체한다.
   * 대체 사실도 나중에 다시 정정할 수 있다.
   */
  async correct(
    target: CorrectionTarget,
    correction: Correction,
  ): Promise<{ correctionId: string; replacementEventId: string | null }> {
    const { unit, product, event } = target;

    let replacement: UnitEvent | null = null;
    if (correction.replacement) {
      replacement = await this.insertEvent(unit, {
        ...correction.replacement,
        caseId: event.caseId,
        source: { system: 'logistics-hub:correction', ref: correction.actor },
        idempotencyKey: null,
        note: null,
      });
    }

    const saved = await this.units.addCorrection({
      targetEventId: event.id,
      replacementEventId: replacement?.id ?? null,
      reason: correction.reason,
      actor: correction.actor,
      recordedAt: new Date(),
    });

    // 무효화를 먼저, 대체 사실을 나중에 알려야 소비 측이 순서대로 되돌리고 다시 적용할 수 있다.
    await this.outbox.enqueue(
      Topics.scmUnitEvents,
      unit.serialNumber,
      makeEvent('scm.unit.event-voided', {
        ...this.toPayload(unit, product, event, target.locationCode),
        reason: correction.reason,
        replacementEventId: replacement?.id ?? null,
      }) satisfies UnitEventVoided,
    );
    if (replacement) {
      await this.announce(
        unit,
        product,
        replacement,
        correction.replacement?.location?.code ?? null,
      );
    }

    await this.reproject(unit.id);
    return { correctionId: saved.id, replacementEventId: replacement?.id ?? null };
  }

  /** 한 제품의 생애주기 전체. 정정으로 무효화된 사실도 정정 내역과 함께 준다. */
  async lifecycle(serialNumber: string): Promise<UnitLifecycle> {
    const found = await this.units.findLifecycle(serialNumber);
    if (!found) throw scmError('UNIT_NOT_FOUND', `Unit ${serialNumber} not found`);
    return found;
  }

  /** 정정이 반영된 "우리가 믿는" 재고다. */
  stock(): Promise<StockCount[]> {
    return this.units.countStock();
  }

  private insertEvent(unit: Unit, fact: NewUnitEvent): Promise<UnitEvent> {
    const { location, ...rest } = fact;
    return this.units.addEvent({
      ...rest,
      unitId: unit.id,
      recordedAt: new Date(),
      locationId: location?.id ?? null,
    });
  }

  private async announce(
    unit: Unit,
    product: ProductRef,
    event: UnitEvent,
    locationCode: string | null,
  ) {
    await this.outbox.enqueue(
      Topics.scmUnitEvents,
      unit.serialNumber,
      makeEvent(
        'scm.unit.event-recorded',
        this.toPayload(unit, product, event, locationCode),
      ) satisfies UnitEventRecorded,
    );
  }

  private toPayload(
    unit: Unit,
    product: ProductRef,
    event: UnitEvent,
    locationCode: string | null,
  ): UnitEventRecorded['payload'] {
    return {
      eventId: event.id,
      serialNumber: unit.serialNumber,
      sku: product.sku,
      eventType: event.type,
      occurredAt: event.occurredAt.toISOString(),
      locationCode,
      // 배송 완료는 보통 택배사가 주문 정보 없이 보고한다. 출고 때 붙은 주문을 이어 붙인다.
      orderRef: event.orderRef ?? (event.type === 'DELIVERED' ? unit.orderRef : null),
      caseId: event.caseId,
    };
  }

  /** 정정되지 않은 사실만 모아 현재 상태를 다시 만든다. */
  private async reproject(unitId: string) {
    const effective = await this.units.listEffectiveEvents(unitId);
    await this.units.updateState(unitId, projectUnit(effective), new Date());
  }
}
