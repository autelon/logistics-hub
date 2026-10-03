import { Inject, Injectable } from '@nestjs/common';

import type { LinkShipmentRequest, ShipmentDetailView } from '@repo/contracts/transport';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { scmError } from '../errors.js';
import { GetShipmentUsecase } from './get-shipment.usecase.js';

/**
 * 운영자가 발주에 연결되지 않은 선적(`PO_UNLINKED`)을 발주에 연결한다. 우리가 내리는 명령이라 전제가 맞지 않으면 거절한다:
 * 모르는 선적 `SHIPMENT_NOT_FOUND`, 이미 연결된 선적 `SHIPMENT_ALREADY_LINKED`, 모르는 발주 `PO_NOT_FOUND`,
 * ISSUED 가 아닌 발주 `PO_NOT_ISSUED`, 맞는 발주 줄이 없는 선적 줄 `SHIPMENT_LINES_UNMATCHED`.
 *
 * 보고된 값은 바뀌지 않는다. 연결 기록(`shipment_links`)이 추가되고 선적의 해석 값(발주, 번호, 줄의 발주 줄)만 채워진다.
 * 이미 차수를 받은 선적의 번호는 바뀌지 않고, 이 선적이 그 발주의 다음 차수를 받는다.
 */
@Injectable()
export class LinkShipmentUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly shipments: ShipmentService,
    private readonly getShipment: GetShipmentUsecase,
  ) {}

  execute(
    shipmentNo: string,
    { poNumber, actor, reason }: LinkShipmentRequest,
  ): Promise<ShipmentDetailView> {
    return this.tx.run(async () => {
      // 트랜잭션의 첫 쿼리. 같은 발주로 들어오는 선적의 차수 번호와 선적 누계를 직렬화한다.
      const { order, lines } = await this.purchaseOrders.lockByPoNumber(poNumber);
      if (order.status !== 'ISSUED') {
        throw scmError(
          'PO_NOT_ISSUED',
          `${poNumber} is ${order.status}; only an issued purchase order can take shipments`,
        );
      }

      const current = await this.shipments.get(shipmentNo);
      const products = await this.catalog.productsOf([
        ...lines.map((line) => line.productId),
        ...current.lines.map((line) => line.productId),
      ]);
      const linked = await this.shipments.link(
        shipmentNo,
        {
          id: order.id,
          order: {
            poNumber: order.poNumber,
            lines: lines.map((line) => ({
              id: line.id,
              lineNo: line.lineNo,
              productId: line.productId,
              orderedQty: line.orderedQty,
              overTolerancePct: line.overTolerancePct,
              closed: line.closed,
              cancelled: line.cancelled,
            })),
          },
        },
        new Map([...products.values()].map((product) => [product.id, product.sku])),
        { actor, reason },
      );
      return this.getShipment.execute(linked.shipment.shipmentNo);
    });
  }
}
