import 'reflect-metadata';

import { beforeEach, describe, expect, it } from 'vitest';

import type { EventOutbox } from '@repo/nest-kit/event-outbox';

import type { PlannedLine, SellableDefinition } from '../domain/fulfillment.js';
import type {
  FulfillmentItem,
  FulfillmentItemPatch,
  NewFulfillmentItem,
  NewOrder,
  Order,
  OrderDetail,
} from '../domain/order.js';
import type { OrderRepository } from '../domain/order.repository.js';
import { OrderService } from './order.service.js';

/** 메모리 구현. 잠금은 없고, 조회 순서(만든 순)만 지킨다. */
class FakeOrderRepository implements OrderRepository {
  orders: Order[] = [];
  items: FulfillmentItem[] = [];
  private seq = 0;

  private nextId() {
    return String(++this.seq).padStart(3, '0');
  }

  findByChannelOrderNo(channel: string, channelOrderNo: string) {
    return Promise.resolve(
      this.orders.find((o) => o.channel === channel && o.channelOrderNo === channelOrderNo),
    );
  }

  findDetailById(orderId: string): Promise<OrderDetail | undefined> {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return Promise.resolve(undefined);
    return Promise.resolve({
      order,
      lines: [],
      items: this.items.filter((i) => i.orderId === orderId),
    });
  }

  findRecentDetails(): Promise<OrderDetail[]> {
    throw new Error('not used');
  }

  create(order: NewOrder, plan: readonly PlannedLine[]): Promise<OrderDetail> {
    const now = new Date();
    const created: Order = {
      ...order,
      id: this.nextId(),
      publicId: 'ORD-2026-000001',
      createdAt: now,
    };
    this.orders.push(created);
    const items = plan.flatMap((line) => {
      const orderLineId = this.nextId();
      return line.skus.map((sku) => ({
        id: this.nextId(),
        orderId: created.id,
        orderLineId,
        sku,
        status: 'PENDING' as const,
        reason: 'ORDER' as const,
        replacesItemId: null,
        serialNumber: null,
        shippedAt: null,
        deliveredAt: null,
        doaCaseId: null,
        createdAt: now,
      }));
    });
    this.items.push(...items);
    return Promise.resolve({ order: created, lines: [], items });
  }

  findItemsByOrderIdForUpdate(orderId: string) {
    return Promise.resolve(this.items.filter((i) => i.orderId === orderId));
  }

  findShippedItemBySerialForUpdate(serialNumber: string) {
    const item = this.items.find(
      (i) =>
        i.serialNumber === serialNumber && (i.status === 'SHIPPED' || i.status === 'DELIVERED'),
    );
    const order = item && this.orders.find((o) => o.id === item.orderId);
    return Promise.resolve(item && order ? { item, order } : undefined);
  }

  updateItem(itemId: string, patch: FulfillmentItemPatch) {
    const index = this.items.findIndex((i) => i.id === itemId);
    this.items[index] = { ...this.items[index]!, ...patch };
    return Promise.resolve();
  }

  addItem(item: NewFulfillmentItem) {
    const created: FulfillmentItem = {
      ...item,
      id: this.nextId(),
      serialNumber: null,
      shippedAt: null,
      deliveredAt: null,
      doaCaseId: null,
      createdAt: new Date(),
    };
    this.items.push(created);
    return Promise.resolve(created);
  }
}

class FakeOutbox implements EventOutbox {
  events: { topic: string; key: string; event: unknown }[] = [];
  enqueue(topic: string, key: string, event: unknown) {
    this.events.push({ topic, key, event });
    return Promise.resolve();
  }
}

const definitions = new Map<string, SellableDefinition>([
  [
    'KIT',
    {
      code: 'KIT',
      name: '키트',
      kind: 'PACKAGE',
      components: [
        { sku: 'CAM-01', quantity: 1 },
        { sku: 'BAT-01', quantity: 1 },
      ],
    },
  ],
]);

const at = new Date('2026-10-03T00:00:00.000Z');

describe('OrderService', () => {
  let repo: FakeOrderRepository;
  let outbox: FakeOutbox;
  let service: OrderService;
  let orderId: string;

  beforeEach(async () => {
    repo = new FakeOrderRepository();
    outbox = new FakeOutbox();
    service = new OrderService(repo, outbox);
    const order = await service.ingest(
      { channel: 'web', channelOrderNo: 'W-1', orderedAt: at },
      [{ sellableCode: 'KIT', quantity: 1 }],
      definitions,
    );
    orderId = order.id;
  });

  it('주문을 받으면 출고 항목마다 출고 요청 이벤트를 한 번에 낸다', () => {
    expect(repo.items.map((i) => i.sku)).toEqual(['CAM-01', 'BAT-01']);
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]).toMatchObject({
      topic: 'oms.order-events',
      key: orderId,
      event: {
        type: 'oms.fulfillment.requested',
        payload: {
          orderId,
          items: [
            { sku: 'CAM-01', reason: 'ORDER', replacesItemId: null },
            { sku: 'BAT-01', reason: 'ORDER', replacesItemId: null },
          ],
        },
      },
    });
  });

  it('정의되지 않은 판매 상품은 UNKNOWN_SELLABLE 로 거절한다', async () => {
    await expect(
      service.ingest(
        { channel: 'web', channelOrderNo: 'W-2', orderedAt: at },
        [{ sellableCode: 'NOPE', quantity: 1 }],
        definitions,
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_SELLABLE', details: { codes: ['NOPE'] } });
  });

  it('출고·배송 보고를 항목에 붙이고, 무효화되면 되돌린다', async () => {
    const report = {
      orderId,
      fulfillmentItemId: null,
      serialNumber: 'SN-1',
      sku: 'CAM-01',
      occurredAt: at,
    };
    await service.applyShipmentReport({ ...report, change: 'RECORDED', event: 'SHIPPED' });
    expect(repo.items[0]).toMatchObject({ status: 'SHIPPED', serialNumber: 'SN-1', shippedAt: at });

    await service.applyShipmentReport({ ...report, change: 'RECORDED', event: 'DELIVERED' });
    expect(repo.items[0]).toMatchObject({ status: 'DELIVERED', deliveredAt: at });

    await service.applyShipmentReport({ ...report, change: 'VOIDED', event: 'DELIVERED' });
    expect(repo.items[0]).toMatchObject({ status: 'SHIPPED', deliveredAt: null });

    await service.applyShipmentReport({ ...report, change: 'VOIDED', event: 'SHIPPED' });
    expect(repo.items[0]).toMatchObject({ status: 'PENDING', serialNumber: null, shippedAt: null });
  });

  it('맞는 미출고 항목이 없는 출고 보고는 무시한다', async () => {
    await service.applyShipmentReport({
      change: 'RECORDED',
      event: 'SHIPPED',
      orderId,
      fulfillmentItemId: null,
      serialNumber: 'SN-9',
      sku: 'ZZZ',
      occurredAt: at,
    });
    expect(repo.items.every((i) => i.status === 'PENDING')).toBe(true);
  });

  it('DOA 확정이면 항목을 불량 처리하고 교체 항목의 출고를 요청한다', async () => {
    await service.applyShipmentReport({
      change: 'RECORDED',
      event: 'SHIPPED',
      orderId,
      fulfillmentItemId: null,
      serialNumber: 'SN-1',
      sku: 'CAM-01',
      occurredAt: at,
    });
    await service.applyDoaConfirmed({ serialNumber: 'SN-1', caseId: 'CASE-1' });

    const [original, , replacement] = repo.items;
    expect(original).toMatchObject({ status: 'DOA', doaCaseId: 'CASE-1' });
    expect(replacement).toMatchObject({
      sku: 'CAM-01',
      status: 'PENDING',
      reason: 'DOA_REPLACEMENT',
      replacesItemId: original!.id,
    });
    expect(outbox.events[1]).toMatchObject({
      event: {
        type: 'oms.fulfillment.requested',
        payload: {
          items: [
            {
              fulfillmentItemId: replacement!.id,
              reason: 'DOA_REPLACEMENT',
              replacesItemId: original!.id,
            },
          ],
        },
      },
    });
  });

  it('주문으로 나간 적 없는 시리얼의 DOA 는 아무것도 하지 않는다', async () => {
    await service.applyDoaConfirmed({ serialNumber: 'SN-X', caseId: 'CASE-2' });
    expect(repo.items).toHaveLength(2);
    expect(outbox.events).toHaveLength(1);
  });
});
