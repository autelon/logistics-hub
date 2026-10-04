import { Inject, Injectable } from '@nestjs/common';

import { scmError } from '../../../errors.js';
import { roundShipmentNo } from '../domain/shipment-numbering.js';
import { planLink, type PlanningOrder } from '../domain/shipment-plan.js';
import { decideVoid, isVoided } from '../domain/shipment-void.js';
import type {
  NewShipment,
  Shipment,
  ShipmentCorrection,
  ShipmentDetail,
  ShipmentFilter,
} from '../domain/shipment.js';
import { ShipmentRepository } from '../domain/shipment.repository.js';

/** 선적을 기록할 초안. 발주에 연결되는 것은 발주 번호를 알아야 차수 번호를 매길 수 있어 id 와 번호를 함께 받는다. */
export type ShipmentDraft = Omit<NewShipment, 'shipmentNo' | 'purchaseOrderId'> & {
  purchaseOrder: { id: string; poNumber: string } | null;
};

export interface LinkTarget {
  id: string;
  order: PlanningOrder;
}

/**
 * 제조사·포워더가 보고한 선적. 보고된 값은 추가만 하고 고치지 않는다 (수정·삭제를 제공하지 않는다).
 * 차수 번호와 연결 명령은 발주 줄을 알아야 하므로 발주(procurement)에서 읽은 값을 usecase 가 넘겨 준다.
 * 트랜잭션은 usecase 가 연다.
 */
@Injectable()
export class ShipmentService {
  constructor(@Inject(ShipmentRepository) private readonly shipments: ShipmentRepository) {}

  /** 이미 기록된 제출: idempotencyKey → 선적. */
  async findDuplicates(keys: readonly string[]): Promise<Map<string, Shipment>> {
    if (keys.length === 0) return new Map();
    const found = await this.shipments.findByIdempotencyKeys(keys);
    return new Map(
      found.flatMap((shipment) =>
        shipment.idempotencyKey ? [[shipment.idempotencyKey, shipment] as const] : [],
      ),
    );
  }

  /**
   * 선적을 넘긴 순서대로 기록한다. 발주에 연결되는 선적은 그 발주의 다음 차수 번호(`<발주 번호>-R<n>`)를 받고,
   * 같은 요청 안에서도 도착 순서대로 n, n+1 … 이다. 연결되지 않은 선적은 `UNLINKED-…` 를 받는다.
   *
   * 차수는 "그 발주에 이미 연결된 선적 수 + 1" 이라 같은 발주의 동시 기록이 겹치지 않도록
   * 호출한 usecase 가 발주 행을 먼저 잠가야 한다 (`PurchaseOrderService.lockAll`).
   */
  async record(drafts: readonly ShipmentDraft[]): Promise<Shipment[]> {
    const purchaseOrderIds = [
      ...new Set(drafts.flatMap(({ purchaseOrder }) => (purchaseOrder ? [purchaseOrder.id] : []))),
    ];
    const rounds = await this.shipments.countByPurchaseOrders(purchaseOrderIds);

    const numbered = drafts.map(({ purchaseOrder, ...draft }): NewShipment => {
      if (!purchaseOrder) return { ...draft, purchaseOrderId: null, shipmentNo: null };
      const round = (rounds.get(purchaseOrder.id) ?? 0) + 1;
      rounds.set(purchaseOrder.id, round);
      return {
        ...draft,
        purchaseOrderId: purchaseOrder.id,
        shipmentNo: roundShipmentNo(purchaseOrder.poNumber, round),
      };
    });
    return this.shipments.insertAll(numbered);
  }

  /** 발주 줄별 선적 수량 누계. 무효화한 선적은 뺀다. */
  shippedQuantities(purchaseOrderLineIds: readonly string[]): Promise<Map<string, number>> {
    if (purchaseOrderLineIds.length === 0) return Promise.resolve(new Map());
    return this.shipments.shippedQuantities(purchaseOrderLineIds);
  }

  /** 이미 어떤 선적에 들어 있는 시리얼. 무효화한 선적의 시리얼은 뺀다. */
  async knownSerials(serialNumbers: readonly string[]): Promise<Set<string>> {
    if (serialNumbers.length === 0) return new Set();
    return this.shipments.findKnownSerials(serialNumbers);
  }

  async get(shipmentNo: string): Promise<ShipmentDetail> {
    const detail = await this.shipments.findByShipmentNo(shipmentNo);
    if (!detail) throw scmError('SHIPMENT_NOT_FOUND', `Unknown shipment ${shipmentNo}`);
    return detail;
  }

  list(filter: ShipmentFilter, limit: number): Promise<ShipmentDetail[]> {
    return this.shipments.listRecent(filter, limit);
  }

  /**
   * 선적의 시리얼 전부. 제품 등록 명령이 선적 단위로 받을 때 쓴다.
   * 무효화한 선적은 거절한다(`SHIPMENT_ALREADY_VOIDED`): 그 선적이 만든 출발 사실은 정정되었다.
   */
  async serialNumbersOf(shipmentNo: string): Promise<string[]> {
    const detail = await this.get(shipmentNo);
    if (isVoided(detail)) {
      throw scmError('SHIPMENT_ALREADY_VOIDED', `Shipment ${detail.shipment.shipmentNo} is voided`);
    }
    return this.shipments.serialNumbersOf(detail.shipment.id);
  }

  /** 선적의 시리얼 전부. 무효화한 선적이어도 준다 (무효화가 정정할 사실을 찾는 데 쓴다). */
  serialNumbersIn({ shipment }: ShipmentDetail): Promise<string[]> {
    return this.shipments.serialNumbersOf(shipment.id);
  }

  /**
   * 무효화할 선적을 잠그고 전제를 검사한다 (우리가 내리는 명령이라 거절한다): 모르는 선적 `SHIPMENT_NOT_FOUND`,
   * 이미 무효화된 선적 `SHIPMENT_ALREADY_VOIDED`. 연결 전 번호로도 찾는다.
   * 연결된 선적이면 호출한 usecase 가 그 발주 행을 먼저 잠가야 한다 (발주 → 선적 → 개체 순서).
   */
  async lockForVoid(shipmentNo: string): Promise<ShipmentDetail> {
    const detail = await this.shipments.findByShipmentNoForUpdate(shipmentNo);
    const decision = decideVoid(detail);
    if (!detail || decision === 'NOT_FOUND') {
      throw scmError('SHIPMENT_NOT_FOUND', `Unknown shipment ${shipmentNo}`);
    }
    if (decision === 'ALREADY_VOIDED') {
      throw scmError(
        'SHIPMENT_ALREADY_VOIDED',
        `Shipment ${detail.shipment.shipmentNo} is already voided`,
      );
    }
    return detail;
  }

  /**
   * 잠근 선적을 무효화한 것으로 기록한다. 보고된 선적은 지우거나 고치지 않고 무효화 기록만 더한다.
   * 이 선적이 만든 제품 이력은 호출한 usecase 가 정정한다 (`UnitService.voidAll`).
   */
  async recordVoid(
    { shipment }: ShipmentDetail,
    { actor, reason }: { actor: string; reason: string },
    now: Date = new Date(),
  ): Promise<Omit<ShipmentCorrection, 'id'>> {
    const correction = { shipmentId: shipment.id, reason, actor, recordedAt: now };
    await this.shipments.addCorrection(correction);
    return correction;
  }

  /**
   * 발주에 연결되지 않은 선적을 운영자가 발주에 연결한다 (우리가 내리는 명령이라 거절할 수 있다).
   * 모든 선적 줄이 발주 줄에 맞아야 하고(`SHIPMENT_LINES_UNMATCHED`), 이미 연결된 선적은 다시 연결하지 않는다(`SHIPMENT_ALREADY_LINKED`).
   * 무효화한 선적은 연결하지 않는다(`SHIPMENT_ALREADY_VOIDED`).
   * 연결 기록(shipment_links)을 추가하고 선적의 해석 값만 채운다: 이미 차수를 받은 다른 선적의 번호는 바뀌지 않고,
   * 이 선적이 그 발주의 다음 차수를 받는다.
   *
   * 호출한 usecase 가 발주 행을 먼저 잠그고, 선적 행은 여기서 잠근다.
   * `skus` 는 제품 id → sku (거절 메시지용, catalog 에서 usecase 가 해석한다).
   */
  async link(
    shipmentNo: string,
    target: LinkTarget,
    skus: ReadonlyMap<string, string>,
    { actor, reason }: { actor: string; reason: string },
    now: Date = new Date(),
  ): Promise<ShipmentDetail> {
    const detail = await this.shipments.findByShipmentNoForUpdate(shipmentNo);
    if (!detail) throw scmError('SHIPMENT_NOT_FOUND', `Unknown shipment ${shipmentNo}`);
    const { shipment, lines } = detail;
    if (isVoided(detail)) {
      throw scmError(
        'SHIPMENT_ALREADY_VOIDED',
        `Shipment ${shipment.shipmentNo} is voided and cannot be linked`,
      );
    }
    if (shipment.purchaseOrderId !== null) {
      throw scmError(
        'SHIPMENT_ALREADY_LINKED',
        `Shipment ${shipment.shipmentNo} is already linked to a purchase order`,
      );
    }

    const shipped = await this.shipments.shippedQuantities(target.order.lines.map((l) => l.id));
    const plan = planLink(
      lines.map((line) => ({
        lineNo: line.lineNo,
        sku: skus.get(line.productId) ?? line.productId,
        productId: line.productId,
        quantity: line.shippedQty,
      })),
      target.order,
      shipped,
    );
    if (!plan.ok) {
      throw scmError(
        'SHIPMENT_LINES_UNMATCHED',
        `${target.order.poNumber} has no line for ${plan.unmatched.map((u) => u.sku).join(', ')}`,
        { lines: plan.unmatched },
      );
    }

    const round =
      ((await this.shipments.countByPurchaseOrders([target.id])).get(target.id) ?? 0) + 1;
    const newShipmentNo = roundShipmentNo(target.order.poNumber, round);
    await this.shipments.link({
      shipmentId: shipment.id,
      purchaseOrderId: target.id,
      previousShipmentNo: shipment.shipmentNo,
      shipmentNo: newShipmentNo,
      actor,
      reason,
      linkedAt: now,
      lineLinks: plan.matches.flatMap((match) => {
        const line = lines.find((candidate) => candidate.lineNo === match.lineNo);
        return line
          ? [{ shipmentLineId: line.id, purchaseOrderLineId: match.purchaseOrderLineId }]
          : [];
      }),
      anomalies: plan.anomalies,
    });
    return this.get(newShipmentNo);
  }
}
