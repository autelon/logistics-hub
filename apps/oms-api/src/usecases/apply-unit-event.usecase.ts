import { Inject, Injectable } from '@nestjs/common';

import type { ScmUnitMessage } from '@repo/contracts/scm';
import { MessageInbox } from '@repo/nest-kit/message-inbox';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { OrderService } from '../domains/order/application/order.service.js';
import { CONSUMER_GROUP } from './consumer-group.js';

/**
 * SCM 의 물리 제품 사실(기록·무효화)을 주문의 출고 항목에 반영한다.
 * 주문 참조가 없거나 출고·배송이 아닌 사실은 주문과 무관하므로 처리 기록도 남기지 않는다.
 */
@Injectable()
export class ApplyUnitEventUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    @Inject(MessageInbox) private readonly inbox: MessageInbox,
    private readonly orders: OrderService,
  ) {}

  async execute(message: ScmUnitMessage): Promise<void> {
    const { orderRef, eventType, serialNumber, sku, occurredAt } = message.payload;
    if (!orderRef || (eventType !== 'SHIPPED' && eventType !== 'DELIVERED')) return;

    await this.tx.run(async () => {
      if (!(await this.inbox.claim(CONSUMER_GROUP, message.id))) return;
      await this.orders.applyShipmentReport({
        change: message.type === 'scm.unit.event-recorded' ? 'RECORDED' : 'VOIDED',
        event: eventType,
        orderId: orderRef.orderId,
        fulfillmentItemId: orderRef.fulfillmentItemId,
        serialNumber,
        sku,
        occurredAt: new Date(occurredAt),
      });
    });
  }
}
