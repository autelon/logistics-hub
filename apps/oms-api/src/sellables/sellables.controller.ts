import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { UpsertSellableRequest, type SellableView } from '@repo/contracts/oms';
import { DB } from '@repo/nest-kit/infra.module';
import { zod } from '@repo/nest-kit/zod.pipe';

import type { Db } from '../db/db.js';
import { sellableComponents, sellables } from '../db/schema.js';
import { sellableKindOf } from '../orders/fulfillment.js';

/** 판매 상품(단품·패키지) 정의. 같은 코드로 다시 보내면 구성을 통째로 바꾼다. */
@Controller('sellables')
export class SellablesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Post()
  async upsert(
    @Body(zod(UpsertSellableRequest)) body: UpsertSellableRequest,
  ): Promise<SellableView> {
    // 같은 SKU 가 여러 번 오면 수량을 합친다.
    const quantities = new Map<string, number>();
    for (const c of body.components)
      quantities.set(c.sku, (quantities.get(c.sku) ?? 0) + c.quantity);
    const components = [...quantities].map(([sku, quantity]) => ({ sku, quantity }));
    const kind = sellableKindOf(components);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(sellables)
        .values({ code: body.code, name: body.name, kind, createdAt: new Date() })
        .onDuplicateKeyUpdate({ set: { name: body.name, kind } });
      await tx.delete(sellableComponents).where(eq(sellableComponents.sellableCode, body.code));
      await tx
        .insert(sellableComponents)
        .values(components.map((c) => ({ ...c, sellableCode: body.code })));
    });
    return { code: body.code, name: body.name, kind, components };
  }

  @Get()
  async list(): Promise<SellableView[]> {
    const rows = await this.db
      .select({ sellable: sellables, component: sellableComponents })
      .from(sellables)
      .innerJoin(sellableComponents, eq(sellableComponents.sellableCode, sellables.code))
      .orderBy(asc(sellables.code), asc(sellableComponents.sku));

    const views = new Map<string, SellableView>();
    for (const { sellable, component } of rows) {
      const view = views.get(sellable.code) ?? {
        code: sellable.code,
        name: sellable.name,
        kind: sellable.kind,
        components: [],
      };
      view.components.push({ sku: component.sku, quantity: component.quantity });
      views.set(sellable.code, view);
    }
    return [...views.values()];
  }
}
