import { Injectable } from '@nestjs/common';

import type { UnitLifecycleView } from '@repo/contracts/scm';

import { UnitService } from '../domains/unit/application/unit.service.js';

/** 한 제품의 생애주기 전체. 정정으로 무효화된 사실도 정정 내역과 함께 보여 준다. */
@Injectable()
export class GetUnitLifecycleUsecase {
  constructor(private readonly units: UnitService) {}

  async execute(serialNumber: string): Promise<UnitLifecycleView> {
    const lifecycle = await this.units.lifecycle(serialNumber);
    const { unit } = lifecycle;
    return {
      serialNumber: unit.serialNumber,
      sku: lifecycle.sku,
      status: unit.status,
      locationCode: lifecycle.locationCode,
      orderRef: unit.orderRef,
      registeredAt: unit.registeredAt?.toISOString() ?? null,
      anomalies: unit.anomalies,
      events: lifecycle.events.map(({ event, locationCode, correction }) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        recordedAt: event.recordedAt.toISOString(),
        locationCode,
        orderRef: event.orderRef,
        caseId: event.caseId,
        source: event.source,
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
}
