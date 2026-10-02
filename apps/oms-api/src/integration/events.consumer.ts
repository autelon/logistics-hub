import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { AsCaseMessage } from '@repo/contracts/as';
import { Topics } from '@repo/contracts/common';
import { ScmUnitMessage } from '@repo/contracts/scm';
import type { MessageBus } from '@repo/messaging/message-bus';
import { MESSAGE_BUS } from '@repo/nest-kit/infra.module';

import { CONSUMER_GROUP, OrdersService } from '../orders/orders.service.js';

/** SCM 과 AS 가 내보내는 이벤트를 주문 쪽 상태에 반영한다. */
@Injectable()
export class EventsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly orders: OrdersService,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe(Topics.scmUnitEvents, CONSUMER_GROUP, async ({ value }) => {
      const parsed = ScmUnitMessage.safeParse(value);
      if (!parsed.success) return this.ignore(value);
      await this.orders.applyUnitMessage(parsed.data);
    });

    await this.bus.subscribe(Topics.asCaseEvents, CONSUMER_GROUP, async ({ value }) => {
      const parsed = AsCaseMessage.safeParse(value);
      if (!parsed.success) return this.ignore(value);
      if (parsed.data.type === 'as.doa.confirmed') await this.orders.applyDoaConfirmed(parsed.data);
    });
  }

  private ignore(value: unknown) {
    this.logger.warn(`Ignoring unrecognized message: ${JSON.stringify(value)}`);
  }
}
