import { Inject, Injectable } from '@nestjs/common';

import type { IngestOrderRequest } from '@repo/contracts/oms';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { OrderService } from '../domains/order/application/order.service.js';
import type { SellableDefinition } from '../domains/order/domain/fulfillment.js';
import { SellableService } from '../domains/sellable/application/sellable.service.js';

/**
 * 채널 주문을 받아 물리 출고 단위로 풀고 출고를 요청한다. 같은 채널 주문번호는 한 번만 받는다.
 * 주문 도메인은 판매 상품 도메인을 모르므로, 여기서 정의를 읽어 주문 도메인에 넘긴다.
 */
@Injectable()
export class IngestOrderUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly orders: OrderService,
    private readonly sellables: SellableService,
  ) {}

  execute(request: IngestOrderRequest): Promise<{ orderId: string; duplicate: boolean }> {
    return this.tx.run(async () => {
      const existing = await this.orders.findByChannelOrderNo(
        request.channel,
        request.channelOrderNo,
      );
      if (existing) return { orderId: existing.id, duplicate: true };

      const codes = [...new Set(request.lines.map((l) => l.sellableCode))];
      const definitions = new Map<string, SellableDefinition>(
        (await this.sellables.findByCodes(codes)).map((s) => [s.code, s]),
      );
      const order = await this.orders.ingest(
        {
          channel: request.channel,
          channelOrderNo: request.channelOrderNo,
          orderedAt: new Date(request.orderedAt),
        },
        request.lines,
        definitions,
      );
      return { orderId: order.id, duplicate: false };
    });
  }
}
