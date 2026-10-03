import { Inject, Injectable } from '@nestjs/common';

import type { CorrectUnitEventRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { UnitService } from '../domains/unit/application/unit.service.js';

export interface CorrectUnitEventResult {
  correctionId: string;
  replacementEventId: string | null;
}

/**
 * 잘못 보고된 사실을 무효화하고, 필요하면 올바른 사실로 대체한다.
 * 기준 정보(제품, 거점)는 잠그지 않는다. 같은 SKU·거점의 다른 제품 처리까지 직렬화되기 때문이다.
 */
@Injectable()
export class CorrectUnitEventUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly units: UnitService,
  ) {}

  execute(eventId: string, request: CorrectUnitEventRequest): Promise<CorrectUnitEventResult> {
    return this.tx.run(async () => {
      const { event, unit } = await this.units.lockForCorrection(eventId);
      const product = await this.catalog.productOf(unit.productId);
      const locationCode = await this.catalog.locationCodeOf(event.locationId);

      const { replacement } = request;
      return this.units.correct(
        { event, unit, product, locationCode },
        {
          reason: request.reason,
          actor: request.actor,
          replacement: replacement && {
            type: replacement.type,
            occurredAt: new Date(replacement.occurredAt),
            location: await this.catalog.resolveLocation(replacement.locationCode),
            orderRef: replacement.orderRef,
          },
        },
      );
    });
  }
}
