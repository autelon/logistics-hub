import { ShipmentService } from '../domains/transport/application/shipment.service.js';
import { unlinkedShipmentNo } from '../domains/transport/domain/shipment-numbering.js';
import type {
  NewShipment,
  NewShipmentLink,
  Shipment,
  ShipmentDetail,
  ShipmentFilter,
  ShipmentLine,
  ShipmentLink,
} from '../domains/transport/domain/shipment.js';
import type { ShipmentRepository } from '../domains/transport/domain/shipment.repository.js';

// 선적 도메인의 단위 테스트용 메모리 구현 (docs/testing.md). 빌드에는 들어가지 않는다.

export class MemoryShipmentRepository implements ShipmentRepository {
  shipments: Shipment[] = [];
  lines: ShipmentLine[] = [];
  /** 줄 id → 시리얼. */
  serials = new Map<string, string[]>();
  links: ShipmentLink[] = [];
  private seq = 0;

  private detailOf(shipment: Shipment): ShipmentDetail {
    return {
      shipment: { ...shipment },
      lines: this.lines
        .filter((line) => line.shipmentId === shipment.id)
        .toSorted((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({ ...line })),
      link: this.links.find((link) => link.shipmentId === shipment.id) ?? null,
    };
  }

  findByIdempotencyKeys(keys: readonly string[]) {
    return Promise.resolve(
      this.shipments.filter((s) => s.idempotencyKey !== null && keys.includes(s.idempotencyKey)),
    );
  }

  insertAll(drafts: readonly NewShipment[]) {
    const stored = drafts.map(({ lines, ...draft }): Shipment => {
      const id = `S${++this.seq}`;
      const shipment: Shipment = {
        ...draft,
        id,
        shipmentNo:
          draft.shipmentNo ??
          unlinkedShipmentNo(`0000-0000-0000-0000-${String(this.seq).padStart(12, '0')}`),
      };
      this.shipments.push(shipment);
      for (const line of lines) {
        const lineId = `${id}-L${line.lineNo}`;
        const { serialNumbers, ...columns } = line;
        this.lines.push({
          ...columns,
          id: lineId,
          shipmentId: id,
          serialCount: serialNumbers.length,
        });
        this.serials.set(lineId, [...serialNumbers]);
      }
      return shipment;
    });
    return Promise.resolve(stored);
  }

  countByPurchaseOrders(purchaseOrderIds: readonly string[]) {
    const counts = new Map<string, number>();
    for (const id of purchaseOrderIds) {
      const count = this.shipments.filter((s) => s.purchaseOrderId === id).length;
      if (count > 0) counts.set(id, count);
    }
    return Promise.resolve(counts);
  }

  shippedQuantities(purchaseOrderLineIds: readonly string[]) {
    const sums = new Map<string, number>();
    for (const line of this.lines) {
      if (line.purchaseOrderLineId && purchaseOrderLineIds.includes(line.purchaseOrderLineId)) {
        sums.set(
          line.purchaseOrderLineId,
          (sums.get(line.purchaseOrderLineId) ?? 0) + line.shippedQty,
        );
      }
    }
    return Promise.resolve(sums);
  }

  findKnownSerials(serialNumbers: readonly string[]) {
    const known = new Set([...this.serials.values()].flat());
    return Promise.resolve(new Set(serialNumbers.filter((serial) => known.has(serial))));
  }

  findByShipmentNo(shipmentNo: string) {
    const shipment =
      this.shipments.find((s) => s.shipmentNo === shipmentNo) ??
      this.shipments.find((s) =>
        this.links.some((l) => l.shipmentId === s.id && l.previousShipmentNo === shipmentNo),
      );
    return Promise.resolve(shipment && this.detailOf(shipment));
  }
  findByShipmentNoForUpdate(shipmentNo: string) {
    return this.findByShipmentNo(shipmentNo);
  }

  listRecent(filter: ShipmentFilter, limit: number) {
    return Promise.resolve(
      this.shipments
        .filter(
          (s) =>
            filter.purchaseOrderId === undefined || s.purchaseOrderId === filter.purchaseOrderId,
        )
        .filter((s) => !filter.unlinkedOnly || s.purchaseOrderId === null)
        .toReversed()
        .slice(0, limit)
        .map((s) => this.detailOf(s)),
    );
  }

  serialNumbersOf(shipmentId: string) {
    const ids = this.lines.filter((l) => l.shipmentId === shipmentId).map((l) => l.id);
    return Promise.resolve([...new Set(ids.flatMap((id) => this.serials.get(id) ?? []))]);
  }

  link(link: NewShipmentLink) {
    this.links.push({ ...link, id: `K${++this.seq}` });
    const shipment = this.shipments.find((s) => s.id === link.shipmentId);
    if (shipment) {
      shipment.purchaseOrderId = link.purchaseOrderId;
      shipment.shipmentNo = link.shipmentNo;
    }
    for (const { shipmentLineId, purchaseOrderLineId } of link.lineLinks) {
      const line = this.lines.find((l) => l.id === shipmentLineId);
      if (line) line.purchaseOrderLineId = purchaseOrderLineId;
    }
    return Promise.resolve();
  }
}

export const setupMemoryShipments = () => {
  const repository = new MemoryShipmentRepository();
  return { repository, service: new ShipmentService(repository) };
};
