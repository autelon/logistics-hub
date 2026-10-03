import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { isDuplicateKeyOn } from '@repo/db-kit/errors';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import {
  shipmentLines,
  shipmentLineSerials,
  shipmentLinks,
  shipments,
} from '../../../db/schema.js';
import { ShipmentConflict } from '../domain/shipment-conflict.js';
import { unlinkedShipmentNo } from '../domain/shipment-numbering.js';
import type {
  NewShipment,
  NewShipmentLink,
  Shipment,
  ShipmentDetail,
  ShipmentFilter,
  ShipmentLine,
  ShipmentLink,
} from '../domain/shipment.js';
import type { ShipmentRepository } from '../domain/shipment.repository.js';

type ShipmentRow = typeof shipments.$inferSelect;
type LineRow = typeof shipmentLines.$inferSelect;
type LinkRow = typeof shipmentLinks.$inferSelect;

const toShipment = ({ sourceSystem, sourceRef, ...row }: ShipmentRow): Shipment => ({
  ...row,
  source: { system: sourceSystem, ref: sourceRef },
});

const toLine = (row: LineRow, serialCount: number): ShipmentLine => ({ ...row, serialCount });

const toLink = (row: LinkRow): ShipmentLink => ({ ...row });

/** IN 절과 다중 행 INSERT 의 한 번 크기. 너무 크면 패킷·플랜이 부담스러워진다. */
const CHUNK = 500;

const chunked = <T>(items: readonly T[]): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks;
};

@Injectable()
export class DrizzleShipmentRepository implements ShipmentRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async findByIdempotencyKeys(keys: readonly string[]): Promise<Shipment[]> {
    const found: Shipment[] = [];
    for (const chunk of chunked(keys)) {
      const rows = await this.db
        .get()
        .select()
        .from(shipments)
        .where(inArray(shipments.idempotencyKey, chunk));
      found.push(...rows.map(toShipment));
    }
    return found;
  }

  async insertAll(drafts: readonly NewShipment[]): Promise<Shipment[]> {
    const shipmentRows: ShipmentRow[] = [];
    const lineRows: LineRow[] = [];
    const serialRows: (typeof shipmentLineSerials.$inferInsert)[] = [];

    for (const { lines, source, ...draft } of drafts) {
      const id = newId();
      shipmentRows.push({
        ...draft,
        id,
        shipmentNo: draft.shipmentNo ?? unlinkedShipmentNo(id),
        sourceSystem: source.system,
        sourceRef: source.ref,
      });
      for (const { serialNumbers, ...line } of lines) {
        const lineId = newId();
        lineRows.push({ ...line, id: lineId, shipmentId: id });
        for (const serialNumber of serialNumbers) {
          serialRows.push({ id: newId(), shipmentLineId: lineId, serialNumber });
        }
      }
    }

    const db = this.db.get();
    try {
      for (const chunk of chunked(shipmentRows)) await db.insert(shipments).values(chunk);
    } catch (error) {
      throw isDuplicateKeyOn(error, shipments.idempotencyKey.uniqueName)
        ? new ShipmentConflict(error)
        : error;
    }
    for (const chunk of chunked(lineRows)) await db.insert(shipmentLines).values(chunk);
    for (const chunk of chunked(serialRows)) await db.insert(shipmentLineSerials).values(chunk);
    return shipmentRows.map(toShipment);
  }

  async countByPurchaseOrders(purchaseOrderIds: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const chunk of chunked(purchaseOrderIds)) {
      const rows = await this.db
        .get()
        .select({ purchaseOrderId: shipments.purchaseOrderId, shipments: count() })
        .from(shipments)
        .where(inArray(shipments.purchaseOrderId, chunk))
        .groupBy(shipments.purchaseOrderId);
      for (const row of rows) {
        if (row.purchaseOrderId !== null) counts.set(row.purchaseOrderId, row.shipments);
      }
    }
    return counts;
  }

  async shippedQuantities(purchaseOrderLineIds: readonly string[]): Promise<Map<string, number>> {
    const sums = new Map<string, number>();
    for (const chunk of chunked(purchaseOrderLineIds)) {
      const rows = await this.db
        .get()
        .select({
          purchaseOrderLineId: shipmentLines.purchaseOrderLineId,
          shippedQty: sql<number>`sum(${shipmentLines.shippedQty})`.mapWith(Number),
        })
        .from(shipmentLines)
        .where(inArray(shipmentLines.purchaseOrderLineId, chunk))
        .groupBy(shipmentLines.purchaseOrderLineId);
      for (const row of rows) {
        if (row.purchaseOrderLineId !== null) sums.set(row.purchaseOrderLineId, row.shippedQty);
      }
    }
    return sums;
  }

  async findKnownSerials(serialNumbers: readonly string[]): Promise<Set<string>> {
    const known = new Set<string>();
    for (const chunk of chunked(serialNumbers)) {
      const rows = await this.db
        .get()
        .selectDistinct({ serialNumber: shipmentLineSerials.serialNumber })
        .from(shipmentLineSerials)
        .where(inArray(shipmentLineSerials.serialNumber, chunk));
      for (const row of rows) known.add(row.serialNumber);
    }
    return known;
  }

  async findByShipmentNo(shipmentNo: string): Promise<ShipmentDetail | undefined> {
    return this.findOne(shipmentNo, false);
  }

  async findByShipmentNoForUpdate(shipmentNo: string): Promise<ShipmentDetail | undefined> {
    return this.findOne(shipmentNo, true);
  }

  async listRecent(filter: ShipmentFilter, limit: number): Promise<ShipmentDetail[]> {
    const conditions: SQL[] = [];
    if (filter.purchaseOrderId !== undefined) {
      conditions.push(eq(shipments.purchaseOrderId, filter.purchaseOrderId));
    }
    if (filter.unlinkedOnly) conditions.push(isNull(shipments.purchaseOrderId));

    // id 는 UUIDv7 이라 기록한 순서대로 정렬된다.
    const rows = await this.db
      .get()
      .select()
      .from(shipments)
      .where(conditions.length > 0 ? sql.join(conditions, sql` and `) : undefined)
      .orderBy(desc(shipments.id))
      .limit(limit);
    return this.loadDetails(rows);
  }

  async serialNumbersOf(shipmentId: string): Promise<string[]> {
    const rows = await this.db
      .get()
      .selectDistinct({ serialNumber: shipmentLineSerials.serialNumber })
      .from(shipmentLineSerials)
      .innerJoin(shipmentLines, eq(shipmentLines.id, shipmentLineSerials.shipmentLineId))
      .where(eq(shipmentLines.shipmentId, shipmentId))
      .orderBy(shipmentLineSerials.serialNumber);
    return rows.map((row) => row.serialNumber);
  }

  async link(link: NewShipmentLink): Promise<void> {
    const db = this.db.get();
    await db.insert(shipmentLinks).values({ id: newId(), ...link });
    await db
      .update(shipments)
      .set({ purchaseOrderId: link.purchaseOrderId, shipmentNo: link.shipmentNo })
      .where(eq(shipments.id, link.shipmentId));
    for (const { shipmentLineId, purchaseOrderLineId } of link.lineLinks) {
      await db
        .update(shipmentLines)
        .set({ purchaseOrderLineId })
        .where(eq(shipmentLines.id, shipmentLineId));
    }
  }

  /** 현재 번호로 찾고, 없으면 연결 전 번호로 찾는다. `lock` 이면 선적 행(과 연결 기록)을 잠근다. */
  private async findOne(shipmentNo: string, lock: boolean): Promise<ShipmentDetail | undefined> {
    const db = this.db.get();
    const current = db
      .select()
      .from(shipments)
      .where(eq(shipments.shipmentNo, shipmentNo))
      .limit(1);
    const [row] = lock ? await current.for('update') : await current;
    if (row) return (await this.loadDetails([row]))[0];

    const former = db
      .select({ shipment: shipments })
      .from(shipments)
      .innerJoin(shipmentLinks, eq(shipmentLinks.shipmentId, shipments.id))
      .where(eq(shipmentLinks.previousShipmentNo, shipmentNo))
      .limit(1);
    const [found] = lock ? await former.for('update') : await former;
    return found && (await this.loadDetails([found.shipment]))[0];
  }

  /** 주어진 선적들의 줄(시리얼 수 포함)과 연결 기록을 한 번에 읽어 붙인다. 입력 순서를 유지한다. */
  private async loadDetails(rows: readonly ShipmentRow[]): Promise<ShipmentDetail[]> {
    if (rows.length === 0) return [];
    const db = this.db.get();
    const shipmentIds = rows.map((row) => row.id);

    const lineRows: LineRow[] = [];
    const linkRows: LinkRow[] = [];
    for (const chunk of chunked(shipmentIds)) {
      lineRows.push(
        ...(await db.select().from(shipmentLines).where(inArray(shipmentLines.shipmentId, chunk))),
      );
      linkRows.push(
        ...(await db.select().from(shipmentLinks).where(inArray(shipmentLinks.shipmentId, chunk))),
      );
    }

    const serialCounts = new Map<string, number>();
    for (const chunk of chunked(lineRows.map((line) => line.id))) {
      const counted = await db
        .select({ shipmentLineId: shipmentLineSerials.shipmentLineId, serials: count() })
        .from(shipmentLineSerials)
        .where(inArray(shipmentLineSerials.shipmentLineId, chunk))
        .groupBy(shipmentLineSerials.shipmentLineId);
      for (const row of counted) serialCounts.set(row.shipmentLineId, row.serials);
    }

    return rows.map((row) => {
      const link = linkRows.find((candidate) => candidate.shipmentId === row.id);
      return {
        shipment: toShipment(row),
        lines: lineRows
          .filter((line) => line.shipmentId === row.id)
          .toSorted((a, b) => a.lineNo - b.lineNo)
          .map((line) => toLine(line, serialCounts.get(line.id) ?? 0)),
        link: link ? toLink(link) : null,
      };
    });
  }
}
