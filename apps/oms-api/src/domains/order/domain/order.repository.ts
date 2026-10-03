import type { PlannedLine } from './fulfillment.js';
import type {
  FulfillmentItem,
  FulfillmentItemPatch,
  NewFulfillmentItem,
  NewOrder,
  Order,
  OrderDetail,
} from './order.js';

export interface OrderRepository {
  findByChannelOrderNo(channel: string, channelOrderNo: string): Promise<Order | undefined>;
  findDetailById(orderId: string): Promise<OrderDetail | undefined>;
  /** 최근에 만든 주문부터. */
  findRecentDetails(limit: number): Promise<OrderDetail[]>;
  /**
   * 주문과 줄, 줄마다 풀린 출고 항목(PENDING / ORDER)을 함께 저장한다.
   * id 와 주문 번호(publicId)를 여기서 발급하므로 트랜잭션 안에서 불러야 번호가 겹치지 않는다.
   */
  create(order: NewOrder, lines: readonly PlannedLine[]): Promise<OrderDetail>;
  /** 주문의 출고 항목 전부를 잠그고 읽는다. 만든 순. */
  findItemsByOrderIdForUpdate(orderId: string): Promise<FulfillmentItem[]>;
  /** 그 시리얼이 붙은 출고(SHIPPED)·배송(DELIVERED) 항목과 주문을 잠그고 읽는다. */
  findShippedItemBySerialForUpdate(
    serialNumber: string,
  ): Promise<{ item: FulfillmentItem; order: Order } | undefined>;
  updateItem(itemId: string, patch: FulfillmentItemPatch): Promise<void>;
  /** id 를 발급해 항목을 추가하고 저장된 모습을 돌려준다. */
  addItem(item: NewFulfillmentItem): Promise<FulfillmentItem>;
}
export const OrderRepository = Symbol('OrderRepository');
