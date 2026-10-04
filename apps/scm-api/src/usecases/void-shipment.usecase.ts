import { Inject, Injectable, Logger } from '@nestjs/common';

import type { VoidShipmentRequest, VoidShipmentResult } from '@repo/contracts/transport';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { ShipmentOrderChanged } from '../domains/transport/domain/shipment-conflict.js';
import { dispatchSourceRefs } from '../domains/transport/domain/shipment-void.js';
import { UnitService, type CorrectionTarget } from '../domains/unit/application/unit.service.js';
import { GetShipmentUsecase } from './get-shipment.usecase.js';
import { retryOnConflict } from './retry-on-conflict.js';

/** 기기 요청의 사유. 운영자가 보면 "출발 때문에 비활성화"가 아니라 선적 무효화 때문임을 알아야 한다. */
const DEVICE_REQUEST_REASON = 'SHIPMENT_VOIDED';

/**
 * 운영자가 선적 전체를 무효화한다. 줄 단위 정정은 없고, 틀렸으면 무효화한 뒤 새 선적으로 다시 제출한다(새 차수 번호).
 * 우리가 내리는 명령이라 전제가 맞지 않으면 거절한다: 모르는 선적 `SHIPMENT_NOT_FOUND`, 이미 무효화된 선적 `SHIPMENT_ALREADY_VOIDED`.
 * 현재 번호로도 연결 전 번호로도 찾는다.
 *
 * 한 트랜잭션 안에서 잠금 순서는 입고와 같이 발주 → 선적 → 개체(시리얼 순)다. 무효화는 발주의 선적 수량 누계를 바꾸므로
 * 발주 행을 먼저 잠그지 않으면 동시에 들어온 입고가 옛 누계로 `OVER_SHIPPED` 를 계산한다. 어느 발주의 선적인지는
 * 잠그기 전에 읽어야 해서 트랜잭션 밖에서 읽고, 그사이 선적이 다른 발주에 연결되었으면 처음부터 다시 한다(`ShipmentOrderChanged`).
 *
 * 그다음 이 선적이 만든 `DISPATCHED` 사실을 정정(무효화)한다: 종류 `DISPATCHED` + 출처 참조가 지금 선적 번호 또는 연결 전 번호
 * (`dispatchSourceRefs`) + 시리얼이 이 선적의 시리얼. 스키마에 참조 칸을 더하지 않았으므로 잠근 개체의 사실에서 찾는다.
 * 이미 정정된 사실은 건너뛴다. 활성 여부가 바뀐 개체가 있으면 기기 요청을 만든다(종류마다 하나, 사유 `SHIPMENT_VOIDED`).
 */
@Injectable()
export class VoidShipmentUsecase {
  private readonly logger = new Logger(VoidShipmentUsecase.name);

  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly shipments: ShipmentService,
    private readonly units: UnitService,
    private readonly deviceRequests: DeviceRequestService,
    private readonly getShipment: GetShipmentUsecase,
  ) {}

  execute(shipmentNo: string, request: VoidShipmentRequest): Promise<VoidShipmentResult> {
    // 처음부터 다시 하는 단위는 읽기와 트랜잭션을 여닫는 것까지다.
    const attempt = async () => {
      const { shipment } = await this.shipments.get(shipmentNo);
      try {
        return await this.tx.run(() =>
          this.voidInTransaction(shipmentNo, shipment.purchaseOrderId, request),
        );
      } catch (error) {
        if (error instanceof ShipmentOrderChanged) {
          this.logger.warn(`Shipment void raced with a link command: ${error.message}`);
        }
        throw error;
      }
    };
    return retryOnConflict(ShipmentOrderChanged, attempt);
  }

  private async voidInTransaction(
    shipmentNo: string,
    purchaseOrderId: string | null,
    { actor, reason }: VoidShipmentRequest,
  ): Promise<VoidShipmentResult> {
    // 트랜잭션의 첫 쿼리. 같은 발주로 들어오는 선적의 차수 번호와 선적 누계를 직렬화한다.
    if (purchaseOrderId !== null) await this.purchaseOrders.lockAll([purchaseOrderId]);

    const detail = await this.shipments.lockForVoid(shipmentNo);
    if (detail.shipment.purchaseOrderId !== purchaseOrderId) {
      throw new ShipmentOrderChanged(detail.shipment.shipmentNo);
    }
    await this.shipments.recordVoid(detail, { actor, reason });

    const serialNumbers = await this.shipments.serialNumbersIn(detail);
    const locked = await this.units.lockBySerials(serialNumbers);
    const products = await this.catalog.productsOf(locked.map((unit) => unit.productId));
    const unitsById = new Map(locked.map((unit) => [unit.id, unit]));

    const events = await this.units.findBySource(locked, {
      type: 'DISPATCHED',
      sourceRefs: dispatchSourceRefs(detail),
    });
    const locationCodes = new Map(
      await Promise.all(
        [...new Set(events.flatMap(({ locationId }) => (locationId ? [locationId] : [])))].map(
          async (id) => [id, await this.catalog.locationCodeOf(id)] as const,
        ),
      ),
    );
    const targets = events.map((event): CorrectionTarget => {
      const unit = unitsById.get(event.unitId);
      const product = unit && products.get(unit.productId);
      if (!unit || !product) {
        // 잠근 개체와 외래 키로 보장되는 제품이라 서비스 에러가 아니라 데이터 무결성 문제다.
        throw new Error(`Unit or product of event ${event.id} is missing`);
      }
      const locationCode = event.locationId ? (locationCodes.get(event.locationId) ?? null) : null;
      return { event, unit, product, locationCode };
    });

    const result = await this.units.voidAll(targets, {
      reason: `선적 ${detail.shipment.shipmentNo} 무효화: ${reason}`,
      actor,
    });

    const deviceRequestIds: string[] = [];
    const byType = Map.groupBy(result.deviceRequests, ({ deviceRequest }) => deviceRequest);
    for (const [type, changed] of byType) {
      const request = await this.deviceRequests.create({
        type,
        reason: DEVICE_REQUEST_REASON,
        createdBy: actor,
        items: changed.map(({ unit }) => {
          const product = products.get(unit.productId);
          if (!product) throw new Error(`Product ${unit.productId} of unit ${unit.id} is missing`);
          return { unitId: unit.id, serialNumber: unit.serialNumber, sku: product.sku };
        }),
      });
      deviceRequestIds.push(request.id);
    }

    return {
      shipment: await this.getShipment.execute(detail.shipment.shipmentNo),
      voidedEvents: result.voided,
      skippedEvents: result.skipped,
      deviceRequestIds,
    };
  }
}
