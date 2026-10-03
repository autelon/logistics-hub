import { Inject, Injectable, Logger } from '@nestjs/common';

import { makeEvent, Topics } from '@repo/contracts/common';
import type { FulfillmentRequested } from '@repo/contracts/oms';
import { EventOutbox } from '@repo/nest-kit/event-outbox';

import { omsError } from '../../../errors.js';
import {
  pickItemForShipment,
  planOrder,
  UnknownSellableError,
  type SellableDefinition,
} from '../domain/fulfillment.js';
import type {
  FulfillmentItem,
  NewOrder,
  Order,
  OrderDetail,
  ShipmentReport,
} from '../domain/order.js';
import { OrderRepository } from '../domain/order.repository.js';

/** 한 번에 보여 주는 최근 주문 수. */
const RECENT_LIMIT = 50;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @Inject(OrderRepository) private readonly orders: OrderRepository,
    @Inject(EventOutbox) private readonly outbox: EventOutbox,
  ) {}

  /** 같은 채널 주문번호로 이미 받은 주문. 중복 수신을 가려내는 데 쓴다. */
  findByChannelOrderNo(channel: string, channelOrderNo: string): Promise<Order | undefined> {
    return this.orders.findByChannelOrderNo(channel, channelOrderNo);
  }

  /**
   * 채널 주문을 물리 출고 단위로 풀어 저장하고 출고를 요청한다.
   * 판매 상품 정의는 다른 도메인의 것이라 호출 측(usecase)이 읽어서 넘긴다.
   */
  async ingest(
    order: NewOrder,
    lines: readonly { sellableCode: string; quantity: number }[],
    definitions: ReadonlyMap<string, SellableDefinition>,
  ): Promise<Order> {
    let plan;
    try {
      plan = planOrder(lines, definitions);
    } catch (error) {
      if (error instanceof UnknownSellableError) {
        throw omsError('UNKNOWN_SELLABLE', error.message, { codes: error.codes });
      }
      throw error;
    }

    const created = await this.orders.create(order, plan);
    await this.requestFulfillment(created.order, created.items);
    return created.order;
  }

  async get(orderId: string): Promise<OrderDetail> {
    const detail = await this.orders.findDetailById(orderId);
    if (!detail) throw omsError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
    return detail;
  }

  listRecent(): Promise<OrderDetail[]> {
    return this.orders.findRecentDetails(RECENT_LIMIT);
  }

  /** SCM 이 알려 주는 물리 제품의 출고·배송, 그리고 그 사실의 정정을 주문의 출고 항목에 반영한다. */
  async applyShipmentReport(report: ShipmentReport): Promise<void> {
    const { serialNumber, sku, occurredAt: at } = report;
    const items = await this.orders.findItemsByOrderIdForUpdate(report.orderId);
    const linked = items.find((i) => i.serialNumber === serialNumber);

    if (report.change === 'RECORDED' && report.event === 'SHIPPED') {
      const item = pickItemForShipment(items, {
        sku,
        fulfillmentItemId: report.fulfillmentItemId,
      });
      if (!item) {
        this.logger.error(
          `Shipment of ${serialNumber} (${sku}) matches no pending item of order ${report.orderId}`,
        );
        return;
      }
      await this.orders.updateItem(item.id, { status: 'SHIPPED', serialNumber, shippedAt: at });
    } else if (report.change === 'RECORDED') {
      if (linked?.status === 'SHIPPED') {
        await this.orders.updateItem(linked.id, { status: 'DELIVERED', deliveredAt: at });
      }
    } else if (report.event === 'SHIPPED') {
      // 출고 자체가 잘못된 보고였다 → 시리얼을 떼고 다시 출고 대기로.
      if (linked?.status === 'SHIPPED' || linked?.status === 'DELIVERED') {
        await this.orders.updateItem(linked.id, {
          status: 'PENDING',
          serialNumber: null,
          shippedAt: null,
          deliveredAt: null,
        });
      }
    } else if (linked?.status === 'DELIVERED') {
      await this.orders.updateItem(linked.id, { status: 'SHIPPED', deliveredAt: null });
    }
  }

  /** 판매 출고품이 DOA 로 확정되면 그 항목을 불량 처리하고 교체 출고를 요청한다. */
  async applyDoaConfirmed(doa: { serialNumber: string; caseId: string }): Promise<void> {
    const found = await this.orders.findShippedItemBySerialForUpdate(doa.serialNumber);
    // 주문으로 나간 적 없는 제품(예: AS 교체품)의 DOA 는 주문과 무관하다. SCM 이 추적한다.
    if (!found) return;

    await this.orders.updateItem(found.item.id, { status: 'DOA', doaCaseId: doa.caseId });
    const replacement = await this.orders.addItem({
      orderId: found.item.orderId,
      orderLineId: found.item.orderLineId,
      sku: found.item.sku,
      status: 'PENDING',
      reason: 'DOA_REPLACEMENT',
      replacesItemId: found.item.id,
    });
    await this.requestFulfillment(found.order, [replacement]);
  }

  private async requestFulfillment(order: Order, items: readonly FulfillmentItem[]) {
    await this.outbox.enqueue(
      Topics.omsOrderEvents,
      order.id,
      makeEvent('oms.fulfillment.requested', {
        orderId: order.id,
        channel: order.channel,
        channelOrderNo: order.channelOrderNo,
        requestedAt: new Date().toISOString(),
        items: items.map((item) => ({
          fulfillmentItemId: item.id,
          sku: item.sku,
          reason: item.reason,
          replacesItemId: item.replacesItemId,
        })),
      }) satisfies FulfillmentRequested,
    );
  }
}
