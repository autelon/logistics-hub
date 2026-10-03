import type { OrderView } from '@repo/contracts/oms';

import { orderStatusOf } from '../domains/order/domain/fulfillment.js';
import type { OrderDetail } from '../domains/order/domain/order.js';

/** 주문 도메인 타입 → 응답 규격. 조회 usecase 둘(단건, 목록)이 같이 쓴다. */
export const toOrderView = ({ order, lines, items }: OrderDetail): OrderView => ({
  id: order.id,
  publicId: order.publicId,
  channel: order.channel,
  channelOrderNo: order.channelOrderNo,
  orderedAt: order.orderedAt.toISOString(),
  status: orderStatusOf(items.map((i) => i.status)),
  lines: lines.map((line) => ({
    id: line.id,
    lineNo: line.lineNo,
    sellableCode: line.sellableCode,
    sellableName: line.sellableName,
    sellableKind: line.sellableKind,
    quantity: line.quantity,
    items: items
      .filter((i) => i.orderLineId === line.id)
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        status: item.status,
        reason: item.reason,
        replacesItemId: item.replacesItemId,
        serialNumber: item.serialNumber,
        shippedAt: item.shippedAt?.toISOString() ?? null,
        deliveredAt: item.deliveredAt?.toISOString() ?? null,
        doaCaseId: item.doaCaseId,
      })),
  })),
});
