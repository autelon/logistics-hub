import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  IntakeShipmentsRequest,
  IntakeShipmentsResult,
  ShipmentIntakeItem,
} from '@repo/contracts/transport';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import type { Product } from '../domains/catalog/domain/catalog.js';
import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { PurchaseOrderService } from '../domains/procurement/application/purchase-order.service.js';
import type { PurchaseOrderDetail } from '../domains/procurement/domain/purchase-order.js';
import {
  ShipmentService,
  type ShipmentDraft,
} from '../domains/transport/application/shipment.service.js';
import { ShipmentConflict } from '../domains/transport/domain/shipment-conflict.js';
import {
  planShipment,
  type PlanLine,
  type PlanTarget,
  type ShipmentPlan,
} from '../domains/transport/domain/shipment-plan.js';
import type { Shipment } from '../domains/transport/domain/shipment.js';
import { UnitService, type FactTarget } from '../domains/unit/application/unit.service.js';
import { UnitConflict } from '../domains/unit/domain/unit-conflict.js';
import type { Unit } from '../domains/unit/domain/unit.js';
import { scmError } from '../errors.js';
import { retryOnConflict } from './retry-on-conflict.js';

const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing item at ${index}`);
  return item;
};

const distinct = (items: Iterable<string>): string[] => [...new Set(items)];

type Slot =
  /** 같은 idempotencyKey 의 선적이 이미 저장되어 있다. */
  | { kind: 'stored'; shipment: Shipment }
  /** 같은 요청의 앞 항목과 같은 idempotencyKey. */
  | { kind: 'sameRequest'; firstIndex: number }
  | { kind: 'fresh'; item: ShipmentIntakeItem };

interface Planned {
  index: number;
  item: ShipmentIntakeItem;
  lines: { line: ShipmentIntakeItem['lines'][number]; product: Product }[];
  order: PurchaseOrderDetail | undefined;
  /** 발주에 연결되는지: 알고 있는 발주이고 ISSUED 일 때만. */
  linkedOrder: PurchaseOrderDetail | undefined;
  plan: ShipmentPlan;
}

/**
 * 제조사·포워더의 B/L·시리얼 목록 제출을 한꺼번에 기록한다 (대량 경로, 한 트랜잭션). 발주 번호로 발주를 찾아 연결하고
 * 도착 순서대로 차수 번호(`<발주 번호>-R<n>`)를 매긴다. 사전 계획 차수는 없다 (소유자 결정 2026-10-04).
 *
 * 업체가 보고한 사실이라 거부하지 않는다: 모르는 발주 번호이거나 ISSUED 가 아닌 발주, 맞는 발주 줄이 없는 줄,
 * 수량·시리얼의 모순은 모두 기록하고 이상으로 표시한다(`planShipment`). 거절은 마스터 데이터가 없는 SKU 하나뿐이다
 * (`UNKNOWN_SKU`, details 에 항목 번호 `index` 와 줄 번호 `lineNo`).
 *
 * 시리얼 추적 제품의 시리얼마다 제품이 없으면 만들고, 제조사가 보고한 `DISPATCHED` 사실을 남긴다
 * (출처 = 제출의 source.system, 출처 참조 = 선적 번호, 일어난 시각 = shipDate 의 UTC 0시, 없으면 보고 시각).
 * 이미 다른 SKU 로 있는 시리얼은 이상으로 표시하고 사실을 남기지 않는다.
 *
 * 같은 idempotencyKey 의 제출은 한 번만 기록한다. 동시에 들어온 같은 키는 진 쪽이 처음부터 다시 해서 중복으로 알아본다.
 *
 * 순서가 중요하다: 트랜잭션의 첫 쿼리는 발주 행 잠금이다. 그 뒤의 읽기(차수 수, 선적 누계)가 먼저 커밋된
 * 같은 발주의 기록을 보도록, SKU·발주 id 해석처럼 잠금 전에 해야 하는 읽기는 트랜잭션 밖에서 한다.
 */
@Injectable()
export class IntakeShipmentsUsecase {
  private readonly logger = new Logger(IntakeShipmentsUsecase.name);

  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly shipments: ShipmentService,
    private readonly units: UnitService,
    private readonly deviceRequests: DeviceRequestService,
  ) {}

  async execute({ shipments: items }: IntakeShipmentsRequest): Promise<IntakeShipmentsResult> {
    const products = await this.catalog.productsBySku(
      items.flatMap((item) => item.lines.map((line) => line.sku)),
    );
    for (const [index, item] of items.entries()) {
      for (const [lineIndex, line] of item.lines.entries()) {
        if (!products.has(line.sku)) {
          throw scmError('UNKNOWN_SKU', `Unknown sku ${line.sku}`, {
            index,
            lineNo: lineIndex + 1,
            sku: line.sku,
          });
        }
      }
    }
    const purchaseOrderIds = await this.purchaseOrders.idsOf(items.map((item) => item.poNumber));

    // 처음부터 다시 하는 단위는 트랜잭션을 여닫는 것까지다 (안에서 부르면 run 이 합류해 소용없다).
    // 지는 경우는 둘이다: 같은 idempotencyKey 의 선적(`ShipmentConflict`)과, 같은 새 시리얼을 동시에 만들거나
    // 없는 시리얼의 잠금 틈에서 교착이 난 제품 저장(`UnitConflict`). 둘 다 처음부터 다시 하면 이긴 쪽의 커밋이 보인다.
    const attempt = async () => {
      try {
        return await this.tx.run(() =>
          this.record(items, products, [...purchaseOrderIds.values()]),
        );
      } catch (error) {
        if (error instanceof ShipmentConflict || error instanceof UnitConflict) {
          this.logger.warn(
            `Shipment intake lost a race with a concurrent request: ${error.message}`,
          );
        }
        throw error;
      }
    };
    return retryOnConflict([ShipmentConflict, UnitConflict], attempt);
  }

  private async record(
    items: readonly ShipmentIntakeItem[],
    products: ReadonlyMap<string, Product>,
    purchaseOrderIds: readonly string[],
  ): Promise<IntakeShipmentsResult> {
    // 트랜잭션의 첫 쿼리. 같은 발주의 차수 번호와 선적 누계를 직렬화한다.
    const orders = new Map(
      (await this.purchaseOrders.lockAll(purchaseOrderIds)).map((detail) => [
        detail.order.poNumber,
        detail,
      ]),
    );
    const now = new Date();

    const slots = await this.classify(items);
    const { planned, existingUnits } = await this.plan(slots, orders, products);

    const drafts = planned.map(({ item, lines, linkedOrder, plan }): ShipmentDraft => ({
      purchaseOrder: linkedOrder
        ? { id: linkedOrder.order.id, poNumber: linkedOrder.order.poNumber }
        : null,
      reportedPoNumber: item.poNumber,
      blNumber: item.blNumber,
      invoiceNumber: item.invoiceNumber,
      shipper: item.shipper,
      mode: item.mode,
      shipDate: item.shipDate,
      eta: item.eta,
      source: item.source,
      idempotencyKey: item.idempotencyKey ?? null,
      reportedAt: item.reportedAt ? new Date(item.reportedAt) : now,
      recordedAt: now,
      note: item.note,
      anomalies: plan.anomalies,
      lines: lines.map(({ line, product }, i) => {
        const planLine = at(plan.lines, i);
        return {
          lineNo: i + 1,
          purchaseOrderLineId: planLine.purchaseOrderLineId,
          productId: product.id,
          shippedQty: line.quantity,
          lotNo: line.lotNo,
          serialNumbers: planLine.serialNumbers,
        };
      }),
    }));
    const saved = await this.shipments.record(drafts);

    await this.recordDispatches(planned, existingUnits, saved);

    const fresh = new Map(
      planned.map(({ index, linkedOrder, plan }, i) => [
        index,
        {
          shipmentNo: at(saved, i).shipmentNo,
          duplicate: false,
          poNumber: linkedOrder?.order.poNumber ?? null,
          anomalies: plan.anomalies,
        },
      ]),
    );
    return { shipments: await this.resultsOf(slots, fresh) };
  }

  /** 항목마다 새 제출인지, 이미 기록된 제출(저장되어 있거나 같은 요청의 앞 항목)인지 가른다. */
  private async classify(items: readonly ShipmentIntakeItem[]): Promise<Slot[]> {
    const stored = await this.shipments.findDuplicates(
      items.flatMap((item) => (item.idempotencyKey ? [item.idempotencyKey] : [])),
    );
    const firstByKey = new Map<string, number>();
    return items.map((item, index): Slot => {
      const key = item.idempotencyKey;
      if (key === undefined) return { kind: 'fresh', item };
      const existing = stored.get(key);
      if (existing) return { kind: 'stored', shipment: existing };
      const firstIndex = firstByKey.get(key);
      if (firstIndex !== undefined) return { kind: 'sameRequest', firstIndex };
      firstByKey.set(key, index);
      return { kind: 'fresh', item };
    });
  }

  /** 새 제출마다 발주에 맞추고 이상을 찾는다. 앞 제출이 더한 선적 수량과 시리얼은 뒤 제출이 본다. */
  private async plan(
    slots: readonly Slot[],
    orders: ReadonlyMap<string, PurchaseOrderDetail>,
    products: ReadonlyMap<string, Product>,
  ): Promise<{ planned: Planned[]; existingUnits: Unit[] }> {
    const fresh = slots.flatMap((slot, index) =>
      slot.kind === 'fresh'
        ? [
            {
              index,
              item: slot.item,
              lines: slot.item.lines.map((line) => {
                const product = products.get(line.sku);
                if (!product) throw new Error(`Product ${line.sku} was resolved before`);
                return { line, product };
              }),
            },
          ]
        : [],
    );

    const issued = [...orders.values()].filter((detail) => detail.order.status === 'ISSUED');
    const shipped = new Map(
      await this.shipments.shippedQuantities(
        issued.flatMap((detail) => detail.lines.map((line) => line.id)),
      ),
    );

    const allLines = fresh.flatMap((entry) => entry.lines);
    const known = await this.shipments.knownSerials(
      distinct(allLines.flatMap(({ line }) => line.serialNumbers)),
    );
    const existingUnits = await this.units.lockBySerials(
      distinct(
        allLines
          .filter(({ product }) => product.trackingMode === 'SERIAL')
          .flatMap(({ line }) => line.serialNumbers),
      ),
    );
    const unitProducts = new Map(existingUnits.map((unit) => [unit.serialNumber, unit.productId]));

    const planned: Planned[] = [];
    for (const { index, item, lines } of fresh) {
      const order = orders.get(item.poNumber);
      const linkedOrder = order?.order.status === 'ISSUED' ? order : undefined;
      const target: PlanTarget = linkedOrder
        ? {
            kind: 'ORDER',
            order: {
              poNumber: linkedOrder.order.poNumber,
              lines: linkedOrder.lines.map((line) => ({
                id: line.id,
                lineNo: line.lineNo,
                productId: line.productId,
                orderedQty: line.orderedQty,
                overTolerancePct: line.overTolerancePct,
                closed: line.closed,
                cancelled: line.cancelled,
              })),
            },
            shipped,
          }
        : {
            kind: 'UNLINKED',
            reason: order
              ? `발주 ${order.order.poNumber} 가 ${order.order.status} 상태라 연결하지 못함 (ISSUED 아님)`
              : `발주 번호 ${item.poNumber} 를 알 수 없음`,
          };

      const plan = planShipment(
        lines.map(({ line, product }, i): PlanLine => ({
          lineNo: i + 1,
          sku: line.sku,
          productId: product.id,
          trackingMode: product.trackingMode,
          quantity: line.quantity,
          serialNumbers: line.serialNumbers,
        })),
        { target, knownSerials: known, unitProducts },
      );
      for (const [lineId, quantity] of plan.shippedDelta) {
        shipped.set(lineId, (shipped.get(lineId) ?? 0) + quantity);
      }
      for (const planLine of plan.lines) {
        for (const serial of planLine.serialNumbers) known.add(serial);
      }
      planned.push({ index, item, lines, order, linkedOrder, plan });
    }
    return { planned, existingUnits };
  }

  /**
   * 시리얼마다 (없으면 만들고) 제조사가 보고한 DISPATCHED 사실을 남긴다. 한 번에 대량으로 넣고 개체마다 한 번만 다시 접는다.
   * 활성 여부가 바뀌는 드문 경우(폐기된 등록 개체가 다시 출발 보고됨)는 기기 요청을 만든다.
   */
  private async recordDispatches(
    planned: readonly Planned[],
    existingUnits: readonly Unit[],
    saved: readonly Shipment[],
  ): Promise<void> {
    const dispatches = planned.flatMap(({ item, lines, plan }, i) =>
      lines.flatMap(({ product }, lineIndex) =>
        at(plan.lines, lineIndex).recordableSerials.map((serialNumber) => ({
          serialNumber,
          product,
          shipment: at(saved, i),
          item,
        })),
      ),
    );
    if (dispatches.length === 0) return;

    const unitsBySerial = new Map(existingUnits.map((unit) => [unit.serialNumber, unit]));
    const created = await this.units.createAll([
      ...new Map(
        dispatches
          .filter(({ serialNumber }) => !unitsBySerial.has(serialNumber))
          .map(({ serialNumber, product }) => [serialNumber, { serialNumber, product }]),
      ).values(),
    ]);
    for (const unit of created) unitsBySerial.set(unit.serialNumber, unit);

    const targets = dispatches.map(({ serialNumber, product, shipment, item }): FactTarget => {
      const unit = unitsBySerial.get(serialNumber);
      if (!unit) throw new Error(`Unit ${serialNumber} was not created`);
      return {
        unit,
        product,
        fact: {
          type: 'DISPATCHED',
          occurredAt: item.shipDate
            ? new Date(`${item.shipDate}T00:00:00.000Z`)
            : shipment.reportedAt,
          location: null,
          orderRef: null,
          caseId: null,
          source: { system: item.source.system, ref: shipment.shipmentNo },
          idempotencyKey: null,
          note: null,
        },
      };
    });
    const productOfUnit = new Map(targets.map(({ unit, product }) => [unit.id, product]));
    for (const { unit, deviceRequest } of await this.units.recordAll(targets)) {
      const product = productOfUnit.get(unit.id);
      if (!product) continue;
      await this.deviceRequests.create({
        type: deviceRequest,
        reason: 'DISPATCHED',
        createdBy: 'shipment-intake',
        items: [{ unitId: unit.id, serialNumber: unit.serialNumber, sku: product.sku }],
      });
    }
  }

  /** 요청의 항목 순서대로 결과를 만든다. 이미 기록된 제출은 기존 선적을 가리키고 `duplicate: true`. */
  private async resultsOf(
    slots: readonly Slot[],
    fresh: ReadonlyMap<number, IntakeShipmentsResult['shipments'][number]>,
  ): Promise<IntakeShipmentsResult['shipments']> {
    const storedOrderIds = slots.flatMap((slot) =>
      slot.kind === 'stored' && slot.shipment.purchaseOrderId
        ? [slot.shipment.purchaseOrderId]
        : [],
    );
    const poNumbers = new Map(
      (await this.purchaseOrders.getMany(storedOrderIds)).map(({ order }) => [
        order.id,
        order.poNumber,
      ]),
    );

    return slots.map((slot, index) => {
      if (slot.kind === 'fresh') {
        const result = fresh.get(index);
        if (!result) throw new Error(`Missing intake result at ${index}`);
        return result;
      }
      if (slot.kind === 'sameRequest') {
        const first = fresh.get(slot.firstIndex);
        if (!first) throw new Error(`Missing intake result at ${slot.firstIndex}`);
        return { ...first, duplicate: true };
      }
      const { shipment } = slot;
      return {
        shipmentNo: shipment.shipmentNo,
        duplicate: true,
        poNumber: shipment.purchaseOrderId
          ? (poNumbers.get(shipment.purchaseOrderId) ?? null)
          : null,
        // 받을 때의 이상이다. 그 뒤의 연결로 해소된 것은 선적 조회에서 본다.
        anomalies: shipment.anomalies,
      };
    });
  }
}
