import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { deviceRequestItems, deviceRequests } from '../../../db/schema.js';
import type {
  DeviceRequest,
  DeviceRequestCounts,
  DeviceRequestItem,
  ItemResultReport,
  NewDeviceRequest,
} from '../domain/device-request.js';
import type { DeviceRequestRepository } from '../domain/device-request.repository.js';

type RequestRow = typeof deviceRequests.$inferSelect;
type ItemRow = typeof deviceRequestItems.$inferSelect;

/** IN 절과 다중 행 INSERT 의 한 번 크기. */
const CHUNK = 500;

const chunked = <T>(items: readonly T[]): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks;
};

const toRequest = (row: RequestRow): DeviceRequest => row;
const toItem = (row: ItemRow): DeviceRequestItem => row;

const emptyCounts = (): DeviceRequestCounts => ({ total: 0, pending: 0, succeeded: 0, failed: 0 });

const addCount = (counts: DeviceRequestCounts, result: ItemRow['result'], quantity: number) => {
  counts.total += quantity;
  if (result === 'SUCCEEDED') counts.succeeded += quantity;
  else if (result === 'FAILED') counts.failed += quantity;
  else counts.pending += quantity;
};

@Injectable()
export class DrizzleDeviceRequestRepository implements DeviceRequestRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async create(draft: NewDeviceRequest): Promise<DeviceRequest> {
    const row: RequestRow = {
      id: newId(),
      type: draft.type,
      reason: draft.reason,
      createdBy: draft.createdBy,
      createdAt: new Date(),
      notifiedAt: null,
    };
    await this.db.get().insert(deviceRequests).values(row);

    const items: ItemRow[] = draft.items.map((item) => ({
      id: newId(),
      requestId: row.id,
      unitId: item.unitId,
      serialNumber: item.serialNumber,
      sku: item.sku,
      result: 'PENDING',
      resultReason: null,
      resultAt: null,
    }));
    for (const chunk of chunked(items)) {
      await this.db.get().insert(deviceRequestItems).values(chunk);
    }
    return toRequest(row);
  }

  async findById(id: string): Promise<DeviceRequest | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(deviceRequests)
      .where(eq(deviceRequests.id, id))
      .limit(1);
    return row && toRequest(row);
  }

  async markNotified(id: string, at: Date): Promise<void> {
    await this.db
      .get()
      .update(deviceRequests)
      .set({ notifiedAt: at })
      .where(and(eq(deviceRequests.id, id), isNull(deviceRequests.notifiedAt)));
  }

  async listRecent(
    limit: number,
  ): Promise<{ request: DeviceRequest; counts: DeviceRequestCounts }[]> {
    const rows = await this.db
      .get()
      .select()
      .from(deviceRequests)
      .orderBy(desc(deviceRequests.id))
      .limit(limit);
    if (rows.length === 0) return [];

    const grouped = await this.db
      .get()
      .select({
        requestId: deviceRequestItems.requestId,
        result: deviceRequestItems.result,
        quantity: count(),
      })
      .from(deviceRequestItems)
      .where(
        inArray(
          deviceRequestItems.requestId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(deviceRequestItems.requestId, deviceRequestItems.result);

    const countsByRequest = new Map<string, DeviceRequestCounts>();
    for (const { requestId, result, quantity } of grouped) {
      const counts = countsByRequest.get(requestId) ?? emptyCounts();
      addCount(counts, result, quantity);
      countsByRequest.set(requestId, counts);
    }
    return rows.map((row) => ({
      request: toRequest(row),
      counts: countsByRequest.get(row.id) ?? emptyCounts(),
    }));
  }

  async countsOf(requestId: string): Promise<DeviceRequestCounts> {
    const grouped = await this.db
      .get()
      .select({ result: deviceRequestItems.result, quantity: count() })
      .from(deviceRequestItems)
      .where(eq(deviceRequestItems.requestId, requestId))
      .groupBy(deviceRequestItems.result);
    const counts = emptyCounts();
    for (const { result, quantity } of grouped) addCount(counts, result, quantity);
    return counts;
  }

  async listItems(
    requestId: string,
    afterItemId: string | undefined,
    limit: number,
  ): Promise<DeviceRequestItem[]> {
    const rows = await this.db
      .get()
      .select()
      .from(deviceRequestItems)
      .where(
        and(
          eq(deviceRequestItems.requestId, requestId),
          afterItemId ? gt(deviceRequestItems.id, afterItemId) : undefined,
        ),
      )
      .orderBy(asc(deviceRequestItems.id))
      .limit(limit);
    return rows.map(toItem);
  }

  async listFailedItems(requestId: string, limit: number): Promise<DeviceRequestItem[]> {
    const rows = await this.db
      .get()
      .select()
      .from(deviceRequestItems)
      .where(
        and(eq(deviceRequestItems.requestId, requestId), eq(deviceRequestItems.result, 'FAILED')),
      )
      .orderBy(asc(deviceRequestItems.id))
      .limit(limit);
    return rows.map(toItem);
  }

  async findSerials(requestId: string, serialNumbers: readonly string[]): Promise<string[]> {
    const found: string[] = [];
    for (const chunk of chunked(serialNumbers)) {
      const rows = await this.db
        .get()
        .select({ serialNumber: deviceRequestItems.serialNumber })
        .from(deviceRequestItems)
        .where(
          and(
            eq(deviceRequestItems.requestId, requestId),
            inArray(deviceRequestItems.serialNumber, chunk),
          ),
        );
      found.push(...rows.map((row) => row.serialNumber));
    }
    return found;
  }

  async recordResults(
    requestId: string,
    results: readonly ItemResultReport[],
    at: Date,
  ): Promise<void> {
    // 같은 결과·사유끼리 묶어 UPDATE 를 줄인다 (대부분 전부 SUCCEEDED 라 청크당 한 번).
    const groups = Map.groupBy(results, (r) => JSON.stringify([r.result, r.reason]));
    for (const group of groups.values()) {
      const [first] = group;
      if (!first) continue;
      for (const chunk of chunked(group)) {
        await this.db
          .get()
          .update(deviceRequestItems)
          .set({ result: first.result, resultReason: first.reason, resultAt: at })
          .where(
            and(
              eq(deviceRequestItems.requestId, requestId),
              inArray(
                deviceRequestItems.serialNumber,
                chunk.map((r) => r.serialNumber),
              ),
            ),
          );
      }
    }
  }
}
