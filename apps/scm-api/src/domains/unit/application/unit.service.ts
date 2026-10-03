import { Inject, Injectable } from '@nestjs/common';

import { makeEvent, Topics, type OrderRef } from '@repo/contracts/common';
import type {
  DeviceRequestType,
  UnitEventRecorded,
  UnitEventType,
  UnitEventVoided,
} from '@repo/contracts/scm';
import { EventOutbox } from '@repo/nest-kit/event-outbox';

import { scmError } from '../../../errors.js';
import { activationChange } from '../domain/unit-activation.js';
import { projectUnit, type UnitState } from '../domain/unit-projection.js';
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

/** 사실을 기록한 결과. 기록 때문에 기기 서버에 보내야 할 요청이 생겼으면 그 종류. */
export interface RecordedFact {
  event: UnitEvent;
  deviceRequest: DeviceRequestType | null;
}

export interface CorrectionResult {
  correctionId: string;
  replacementEventId: string | null;
  deviceRequest: DeviceRequestType | null;
}

/** 제품 등록 명령이 사실을 기록할 대상. 제품은 이미 잠겨 있어야 한다. */
export interface RegistrationTarget {
  unit: Unit;
  product: ProductRef;
}

/** 한 사실을 기록할 개체. 개체와 제품은 이미 잠겨 있어야 한다. */
export interface FactTarget {
  unit: Unit;
  product: ProductRef;
  fact: NewUnitEvent;
}

/** 시리얼 추적 제품만 등록을 요구한다. */
const projectionOf = (product: ProductRef) => ({
  requiresRegistration: product.trackingMode === 'SERIAL',
});

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

  /** 여러 시리얼을 한 번에 잠근다. 모르는 시리얼은 결과에 없다. */
  lockBySerials(serialNumbers: readonly string[]): Promise<Unit[]> {
    return this.units.findBySerialsForUpdate(serialNumbers);
  }

  /** 처음 보는 시리얼을 등록한다. 사실이 없으므로 상태는 UNKNOWN 이다. */
  register(serialNumber: string, product: ProductRef): Promise<Unit> {
    const now = new Date();
    return this.units.createUnit({
      serialNumber,
      productId: product.id,
      ...projectUnit([], projectionOf(product)),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** 처음 보는 시리얼들을 한 번에 등록한다 (`register` 의 대량 경로). 돌려주는 순서는 넘긴 순서와 같다. */
  createAll(items: readonly { serialNumber: string; product: ProductRef }[]): Promise<Unit[]> {
    if (items.length === 0) return Promise.resolve([]);
    const now = new Date();
    return this.units.createUnits(
      items.map(({ serialNumber, product }) => ({
        serialNumber,
        productId: product.id,
        ...projectUnit([], projectionOf(product)),
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  /**
   * 사실 여러 건을 한 번에 기록하고 알린 뒤, 개체마다 한 번씩만 다시 계산한다 (`record` 의 대량 경로).
   * 한 개체에 사실이 여럿이어도 된다. 개체마다 다시 계산하기 전후를 비교해 기기 서버에 보낼 요청이 필요하면 돌려준다.
   * 개체는 이 호출 직전에 잠근 것이어야 한다.
   */
  async recordAll(
    targets: readonly FactTarget[],
  ): Promise<{ unit: Unit; deviceRequest: DeviceRequestType }[]> {
    if (targets.length === 0) return [];
    const now = new Date();

    // 저장소가 넘겨받은 객체를 제자리에서 갱신할 수 있으니, 갱신하기 전에 값을 따로 떠 둔다.
    const before = new Map(
      targets.map(({ unit }) => [
        unit.id,
        { status: unit.status, registeredAt: unit.registeredAt },
      ]),
    );
    const events = await this.units.addEvents(
      targets.map(({ unit, fact }) => {
        const { location, ...rest } = fact;
        return { ...rest, unitId: unit.id, recordedAt: now, locationId: location?.id ?? null };
      }),
    );
    for (const [i, target] of targets.entries()) {
      const event = events[i];
      if (event) {
        await this.announce(target.unit, target.product, event, target.fact.location?.code ?? null);
      }
    }

    const distinct = [...new Map(targets.map((target) => [target.unit.id, target])).values()];
    const effective = await this.units.listEffectiveEventsOf(distinct.map(({ unit }) => unit.id));
    const byUnit = Map.groupBy(effective, (event) => event.unitId);
    const requests: { unit: Unit; deviceRequest: DeviceRequestType }[] = [];
    for (const { unit, product } of distinct) {
      const state = projectUnit(byUnit.get(unit.id) ?? [], projectionOf(product));
      await this.units.updateState(unit.id, state, now);
      const previous = before.get(unit.id);
      const deviceRequest = previous && activationChange(previous, state);
      if (deviceRequest) requests.push({ unit, deviceRequest });
    }
    return requests;
  }

  /**
   * 사실 한 건을 기록하고 알린 뒤 제품의 현재 상태를 다시 계산한다.
   * 다시 계산하기 전(`unit`)과 후를 비교해 기기 서버에 보낼 요청이 필요하면 그 종류를 돌려준다.
   * `unit` 은 이 호출 직전에 잠근 값이어야 한다 (같은 트랜잭션에서 같은 제품에 두 번 부르면 전후 비교가 틀어진다).
   */
  async record(unit: Unit, product: ProductRef, fact: NewUnitEvent): Promise<RecordedFact> {
    const event = await this.insertEvent(unit, fact);
    await this.announce(unit, product, event, fact.location?.code ?? null);
    const deviceRequest = await this.reproject(unit, product);
    return { event, deviceRequest };
  }

  /**
   * 제품 등록 명령의 대량 경로. `REGISTERED` 사실을 한 번에 넣고, 제품마다 다시 계산한다 (제품당 한 번).
   * 사실 하나씩 `record` 를 부르면 제품마다 사실 조회·삽입·상태 갱신이 따로 나가므로, 삽입과 조회는 묶어서 한다.
   *
   * 기기 요청은 여기서 판단하지 않는다. 등록 명령이 배치 전체를 요청 하나로 만들기 때문이다.
   */
  async registerAll(targets: readonly RegistrationTarget[], actor: string): Promise<void> {
    if (targets.length === 0) return;
    const now = new Date();
    const events = await this.units.addEvents(
      targets.map(({ unit }) => ({
        unitId: unit.id,
        type: 'REGISTERED' as const,
        occurredAt: now,
        recordedAt: now,
        locationId: null,
        orderRef: null,
        caseId: null,
        source: { system: 'logistics-hub', ref: actor },
        idempotencyKey: null,
        note: null,
      })),
    );
    for (const [i, target] of targets.entries()) {
      const event = events[i];
      if (event) await this.announce(target.unit, target.product, event, null);
    }

    const effective = await this.units.listEffectiveEventsOf(targets.map(({ unit }) => unit.id));
    const byUnit = Map.groupBy(effective, (event) => event.unitId);
    for (const { unit, product } of targets) {
      const state = projectUnit(byUnit.get(unit.id) ?? [], projectionOf(product));
      await this.units.updateState(unit.id, state, now);
    }
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
  async correct(target: CorrectionTarget, correction: Correction): Promise<CorrectionResult> {
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

    const deviceRequest = await this.reproject(unit, product);
    return { correctionId: saved.id, replacementEventId: replacement?.id ?? null, deviceRequest };
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

  /**
   * 정정되지 않은 사실만 모아 현재 상태를 다시 만든다.
   * 접기 전의 `unit` 과 접은 결과를 비교해 기기 서버에 보낼 요청이 필요하면 그 종류를 돌려준다.
   */
  private async reproject(unit: Unit, product: ProductRef): Promise<DeviceRequestType | null> {
    // 저장소가 넘겨받은 객체를 제자리에서 갱신할 수 있으니, 갱신하기 전에 값을 따로 떠 둔다.
    const before = { status: unit.status, registeredAt: unit.registeredAt };
    const effective = await this.units.listEffectiveEvents(unit.id);
    const after: UnitState = projectUnit(effective, projectionOf(product));
    await this.units.updateState(unit.id, after, new Date());
    return activationChange(before, after);
  }
}
