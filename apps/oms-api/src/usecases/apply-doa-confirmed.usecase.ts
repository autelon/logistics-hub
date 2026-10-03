import { Inject, Injectable } from '@nestjs/common';

import type { DoaConfirmed } from '@repo/contracts/as';
import { MessageInbox } from '@repo/nest-kit/message-inbox';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { OrderService } from '../domains/order/application/order.service.js';
import { CONSUMER_GROUP } from './consumer-group.js';

/** AS 가 DOA 를 확정하면 판매 출고 항목을 불량 처리하고 교체 출고를 요청한다. */
@Injectable()
export class ApplyDoaConfirmedUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(MessageInbox) private readonly inbox: MessageInbox,
    private readonly orders: OrderService,
  ) {}

  async execute(message: DoaConfirmed): Promise<void> {
    const { serialNumber, caseId } = message.payload;
    await this.tx.run(async () => {
      if (!(await this.inbox.claim(CONSUMER_GROUP, message.id))) return;
      await this.orders.applyDoaConfirmed({ serialNumber, caseId });
    });
  }
}
