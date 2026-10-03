import type { UnitState } from './unit-projection.js';
import type { StockCount, Unit, UnitEvent, UnitEventCorrection, UnitLifecycle } from './unit.js';

export interface UnitRepository {
  findBySerial(serialNumber: string): Promise<Unit | undefined>;
  /** 행 잠금. 같은 시리얼에 대한 기록이 트랜잭션 단위로 직렬화된다. */
  findBySerialForUpdate(serialNumber: string): Promise<Unit | undefined>;
  /** 여러 시리얼을 한 번에 잠근다. 없는 시리얼은 결과에 없다. 잠그는 순서는 시리얼 순으로 고정된다. */
  findBySerialsForUpdate(serialNumbers: readonly string[]): Promise<Unit[]>;
  /** id 는 저장할 때 발급한다. */
  createUnit(unit: Omit<Unit, 'id'>): Promise<Unit>;
  /** 상태 캐시(status 이하)만 갱신한다. */
  updateState(unitId: string, state: UnitState, updatedAt: Date): Promise<void>;

  addEvent(event: Omit<UnitEvent, 'id'>): Promise<UnitEvent>;
  /** 한 번에 여러 건. 돌려주는 순서는 넘긴 순서와 같다. */
  addEvents(events: readonly Omit<UnitEvent, 'id'>[]): Promise<UnitEvent[]>;
  findEventByIdempotencyKey(idempotencyKey: string): Promise<UnitEvent | undefined>;
  /** 사실과 그 제품을 함께 잠근다. 정정 중에 같은 제품의 다른 기록이 끼어들지 못하게. */
  findEventWithUnitForUpdate(
    eventId: string,
  ): Promise<{ event: UnitEvent; unit: Unit } | undefined>;
  /** 정정되지 않은(유효한) 사실만. 순서는 정해져 있지 않다. */
  listEffectiveEvents(unitId: string): Promise<UnitEvent[]>;
  /** 여러 제품의 유효한 사실을 한 번에. `unitId` 로 묶어서 쓴다. */
  listEffectiveEventsOf(unitIds: readonly string[]): Promise<UnitEvent[]>;

  addCorrection(correction: Omit<UnitEventCorrection, 'id'>): Promise<UnitEventCorrection>;
  findCorrectionByTarget(targetEventId: string): Promise<UnitEventCorrection | undefined>;

  findLifecycle(serialNumber: string): Promise<UnitLifecycle | undefined>;
  countStock(): Promise<StockCount[]>;
}
export const UnitRepository = Symbol('UnitRepository');
