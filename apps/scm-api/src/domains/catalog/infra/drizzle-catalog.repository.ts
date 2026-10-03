import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { locations, products } from '../../../db/schema.js';
import type { Location, LocationInput, Product, ProductInput } from '../domain/catalog.js';
import type { CatalogRepository } from '../domain/catalog.repository.js';

@Injectable()
export class DrizzleCatalogRepository implements CatalogRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async upsertProduct(input: ProductInput): Promise<void> {
    await this.db
      .get()
      .insert(products)
      .values({ id: newId(), ...input, createdAt: new Date() })
      .onDuplicateKeyUpdate({ set: { name: input.name } });
  }

  listProducts(): Promise<Product[]> {
    return this.db.get().select().from(products).orderBy(asc(products.sku));
  }

  async findProductBySku(sku: string): Promise<Product | undefined> {
    const [row] = await this.db.get().select().from(products).where(eq(products.sku, sku)).limit(1);
    return row;
  }

  async findProductById(id: string): Promise<Product | undefined> {
    const [row] = await this.db.get().select().from(products).where(eq(products.id, id)).limit(1);
    return row;
  }

  async upsertLocation(input: LocationInput): Promise<void> {
    await this.db
      .get()
      .insert(locations)
      .values({ id: newId(), ...input, createdAt: new Date() })
      .onDuplicateKeyUpdate({
        set: { name: input.name, type: input.type, partner: input.partner },
      });
  }

  listLocations(): Promise<Location[]> {
    return this.db.get().select().from(locations).orderBy(asc(locations.code));
  }

  async findLocationByCode(code: string): Promise<Location | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(locations)
      .where(eq(locations.code, code))
      .limit(1);
    return row;
  }

  async findLocationById(id: string): Promise<Location | undefined> {
    const [row] = await this.db.get().select().from(locations).where(eq(locations.id, id)).limit(1);
    return row;
  }
}
