import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { isDuplicateKeyOn } from '@repo/db-kit/errors';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { locations, products, stockMovements } from '../../../db/schema.js';
import { StockMovementConflict } from '../domain/stock-movement-conflict.js';
import type { NewStockMovement, StockBalance, StockMovement } from '../domain/stock-movement.js';
import type { StockMovementRepository } from '../domain/stock-movement.repository.js';

type MovementRow = typeof stockMovements.$inferSelect;

const toMovement = ({ sourceSystem, sourceRef, ...row }: MovementRow): StockMovement => ({
  ...row,
  source: { system: sourceSystem, ref: sourceRef },
});

const toRow = (movement: NewStockMovement): MovementRow => {
  const { source, ...columns } = movement;
  return { ...columns, id: newId(), sourceSystem: source.system, sourceRef: source.ref };
};

/** IN 절과 다중 행 INSERT 의 한 번 크기. 너무 크면 패킷·플랜이 부담스러워진다. */
const CHUNK = 500;

const chunked = <T>(items: readonly T[]): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks;
};

@Injectable()
export class DrizzleStockMovementRepository implements StockMovementRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async insertAll(movements: readonly NewStockMovement[]): Promise<StockMovement[]> {
    const rows = movements.map(toRow);
    for (const chunk of chunked(rows)) {
      try {
        await this.db.get().insert(stockMovements).values(chunk);
      } catch (error) {
        // idempotencyKey 만 알아본다. 되돌린 이동(reversesMovementId)의 고유 키 위반 같은 것은 그대로 던진다.
        if (isDuplicateKeyOn(error, stockMovements.idempotencyKey.uniqueName)) {
          throw new StockMovementConflict(error);
        }
        throw error;
      }
    }
    return rows.map(toMovement);
  }

  async findIdsByIdempotencyKeys(keys: readonly string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const chunk of chunked(keys)) {
      const rows = await this.db
        .get()
        .select({ id: stockMovements.id, key: stockMovements.idempotencyKey })
        .from(stockMovements)
        .where(inArray(stockMovements.idempotencyKey, chunk));
      for (const { id, key } of rows) if (key !== null) found.set(key, id);
    }
    return found;
  }

  async findByIdForUpdate(id: string): Promise<StockMovement | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.id, id))
      .for('update');
    return row && toMovement(row);
  }

  async findReversalOf(id: string): Promise<StockMovement | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reversesMovementId, id))
      .limit(1);
    return row && toMovement(row);
  }

  /**
   * 이동 하나가 거점 둘에 걸치므로 (도착지 +수량) 줄과 (출발지 -수량) 줄로 푼 뒤 한 번에 합산한다
   * (`ledgerEntries` 와 같은 규칙). 합이 0 인 줄은 HAVING 으로 뺀다.
   */
  balances(): Promise<StockBalance[]> {
    const db = this.db.get();
    const columns = (
      locationId: typeof stockMovements.toLocationId | typeof stockMovements.fromLocationId,
      delta: SQL.Aliased<number>,
    ) => ({
      productId: stockMovements.productId,
      locationId,
      lotNo: stockMovements.lotNo,
      stockStatus: stockMovements.stockStatus,
      delta,
    });

    const incoming = db
      .select(
        columns(stockMovements.toLocationId, sql<number>`${stockMovements.quantity}`.as('delta')),
      )
      .from(stockMovements)
      .where(isNotNull(stockMovements.toLocationId));
    const outgoing = db
      .select(
        columns(
          stockMovements.fromLocationId,
          sql<number>`-${stockMovements.quantity}`.as('delta'),
        ),
      )
      .from(stockMovements)
      .where(isNotNull(stockMovements.fromLocationId));
    const entries = incoming.unionAll(outgoing).as('entries');

    const quantity = sql<number>`sum(${entries.delta})`.mapWith(Number);
    return db
      .select({
        sku: products.sku,
        trackingMode: products.trackingMode,
        locationCode: locations.code,
        lotNo: entries.lotNo,
        stockStatus: entries.stockStatus,
        quantity,
      })
      .from(entries)
      .innerJoin(products, eq(products.id, entries.productId))
      .innerJoin(locations, eq(locations.id, entries.locationId))
      .groupBy(
        products.sku,
        products.trackingMode,
        locations.code,
        entries.lotNo,
        entries.stockStatus,
      )
      .having(sql`sum(${entries.delta}) <> 0`)
      .orderBy(
        asc(products.sku),
        asc(locations.code),
        asc(entries.lotNo),
        asc(entries.stockStatus),
      );
  }
}
