import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, type SQL } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { sellableComponents, sellables } from '../../../db/schema.js';
import type { Sellable } from '../domain/sellable.js';
import type { SellableRepository } from '../domain/sellable.repository.js';

@Injectable()
export class DrizzleSellableRepository implements SellableRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async save(sellable: Sellable): Promise<void> {
    const db = this.db.get();
    await db
      .insert(sellables)
      .values({
        id: newId(),
        code: sellable.code,
        name: sellable.name,
        kind: sellable.kind,
        createdAt: new Date(),
      })
      .onDuplicateKeyUpdate({ set: { name: sellable.name, kind: sellable.kind } });
    const [row] = await db
      .select({ id: sellables.id })
      .from(sellables)
      .where(eq(sellables.code, sellable.code))
      .for('update');
    const sellableId = row!.id;
    await db.delete(sellableComponents).where(eq(sellableComponents.sellableId, sellableId));
    await db
      .insert(sellableComponents)
      .values(sellable.components.map((c) => ({ ...c, id: newId(), sellableId })));
  }

  findAll(): Promise<Sellable[]> {
    return this.findWhere(undefined);
  }

  findByCodes(codes: readonly string[]): Promise<Sellable[]> {
    if (codes.length === 0) return Promise.resolve([]);
    return this.findWhere(inArray(sellables.code, [...codes]));
  }

  /** 구성품이 없는 판매 상품은 없으므로 inner join 으로 한 번에 읽고 코드별로 모은다. */
  private async findWhere(where: SQL | undefined): Promise<Sellable[]> {
    const rows = await this.db
      .get()
      .select({ sellable: sellables, component: sellableComponents })
      .from(sellables)
      .innerJoin(sellableComponents, eq(sellableComponents.sellableId, sellables.id))
      .where(where)
      .orderBy(asc(sellables.code), asc(sellableComponents.sku));

    const byCode = new Map<string, Sellable>();
    for (const { sellable, component } of rows) {
      const found = byCode.get(sellable.code) ?? {
        code: sellable.code,
        name: sellable.name,
        kind: sellable.kind,
        components: [],
      };
      found.components.push({ sku: component.sku, quantity: component.quantity });
      byCode.set(sellable.code, found);
    }
    return [...byCode.values()];
  }
}
