import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AsCaseMessage } from '@repo/contracts/as';
import { Topics } from '@repo/contracts/common';
import type { MessageBus } from '@repo/messaging/message-bus';
import { MESSAGE_BUS } from '@repo/nest-kit/infra.module';

import { ApplyDoaConfirmedUsecase } from '../../usecases/apply-doa-confirmed.usecase.js';
import { CONSUMER_GROUP } from '../../usecases/consumer-group.js';

/** AS 가 내보내는 접수 이벤트 중 주문에 영향을 주는 것(DOA 확정)을 반영한다. */
@Injectable()
export class AsCaseEventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(AsCaseEventsConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly applyDoaConfirmed: ApplyDoaConfirmedUsecase,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe(Topics.asCaseEvents, CONSUMER_GROUP, async ({ value }) => {
      const parsed = AsCaseMessage.safeParse(value);
      if (!parsed.success) {
        this.logger.warn(`Ignoring unrecognized message: ${JSON.stringify(value)}`);
        return;
      }
      if (parsed.data.type === 'as.doa.confirmed') {
        await this.applyDoaConfirmed.execute(parsed.data);
      }
    });
  }
}
