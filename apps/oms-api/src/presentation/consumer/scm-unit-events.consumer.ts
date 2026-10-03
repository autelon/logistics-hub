import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { Topics } from '@repo/contracts/common';
import { ScmUnitMessage } from '@repo/contracts/scm';
import type { MessageBus } from '@repo/messaging/message-bus';
import { MESSAGE_BUS } from '@repo/nest-kit/infra.module';

import { ApplyUnitEventUsecase } from '../../usecases/apply-unit-event.usecase.js';
import { CONSUMER_GROUP } from '../../usecases/consumer-group.js';

/** SCM 이 내보내는 물리 제품 사실을 주문 쪽 상태에 반영한다. */
@Injectable()
export class ScmUnitEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScmUnitEventsConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly applyUnitEvent: ApplyUnitEventUsecase,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe(Topics.scmUnitEvents, CONSUMER_GROUP, async ({ value }) => {
      const parsed = ScmUnitMessage.safeParse(value);
      if (!parsed.success) {
        this.logger.warn(`Ignoring unrecognized message: ${JSON.stringify(value)}`);
        return;
      }
      await this.applyUnitEvent.execute(parsed.data);
    });
  }
}
