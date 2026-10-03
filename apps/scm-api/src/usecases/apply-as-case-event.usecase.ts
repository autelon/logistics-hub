import { Inject, Injectable } from '@nestjs/common';

import type { AsCaseMessage } from '@repo/contracts/as';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { UnitService } from '../domains/unit/application/unit.service.js';

/**
 * `unknown-serial`: 우리가 모르는 시리얼. 재시도해도 결과가 같으므로 기록하지 않고 끝낸다.
 * `duplicate`: 같은 메시지를 이미 처리했다.
 */
export type ApplyAsCaseEventResult = 'recorded' | 'duplicate' | 'unknown-serial';

/**
 * AS 시스템이 알려 주는 DOA 확정·폐기를 해당 제품의 생애주기에 사실로 기록한다.
 *
 * 멱등 처리는 메시지 id 를 사실의 idempotencyKey(`message:<id>`)로 써서 한다. 이 서비스에는
 * `processed_messages` 테이블이 없어 `MessageInbox` 를 쓰려면 스키마가 바뀌므로, 옮기기 전과 같은 방식을 유지한다.
 */
@Injectable()
export class ApplyAsCaseEventUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly units: UnitService,
  ) {}

  execute(message: AsCaseMessage): Promise<ApplyAsCaseEventResult> {
    const { id, type, payload } = message;
    return this.tx.run(async () => {
      if (await this.units.findDuplicate(`message:${id}`)) return 'duplicate';

      const unit = await this.units.lockBySerial(payload.serialNumber);
      if (!unit) return 'unknown-serial';
      const product = await this.catalog.productOf(unit.productId);

      await this.units.record(unit, product, {
        type: type === 'as.doa.confirmed' ? 'DOA_CONFIRMED' : 'SCRAPPED',
        occurredAt: new Date(
          type === 'as.doa.confirmed' ? payload.confirmedAt : payload.scrappedAt,
        ),
        location: null,
        orderRef: null,
        caseId: payload.caseId,
        source: { system: 'as-api', ref: payload.caseId },
        idempotencyKey: `message:${id}`,
        note: type === 'as.doa.confirmed' ? `${payload.origin} / ${payload.disposition}` : null,
      });
      return 'recorded';
    });
  }
}
