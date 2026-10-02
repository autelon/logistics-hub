import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AsCaseMessage } from '@repo/contracts/as';
import { Topics } from '@repo/contracts/common';
import type { MessageBus } from '@repo/messaging/message-bus';
import { MESSAGE_BUS } from '@repo/nest-kit/infra.module';

import { UnitsService } from '../units/units.service.js';

/** AS 시스템이 알려 주는 DOA 확정·폐기를 해당 제품의 생애주기에 기록한다. */
@Injectable()
export class AsEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(AsEventsConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly units: UnitsService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe(Topics.asCaseEvents, 'scm-api', (message) =>
      this.handle(message.value),
    );
  }

  async handle(value: unknown) {
    const parsed = AsCaseMessage.safeParse(value);
    if (!parsed.success) {
      this.logger.warn(`Ignoring unrecognized message: ${JSON.stringify(value)}`);
      return;
    }
    const { id, type, payload } = parsed.data;

    if (!(await this.units.findSkuBySerial(payload.serialNumber))) {
      // 우리가 모르는 시리얼. 재시도해도 결과가 같으므로 버리고 기록만 남긴다.
      this.logger.error(
        `${type} for unknown serial ${payload.serialNumber} (case ${payload.caseId})`,
      );
      return;
    }

    await this.units.record({
      serialNumber: payload.serialNumber,
      type: type === 'as.doa.confirmed' ? 'DOA_CONFIRMED' : 'SCRAPPED',
      occurredAt: type === 'as.doa.confirmed' ? payload.confirmedAt : payload.scrappedAt,
      locationCode: null,
      orderRef: null,
      caseId: payload.caseId,
      source: { system: 'as-api', ref: payload.caseId },
      idempotencyKey: `message:${id}`,
      note: type === 'as.doa.confirmed' ? `${payload.origin} / ${payload.disposition}` : null,
    });
  }
}
