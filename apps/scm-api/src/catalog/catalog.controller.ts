import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { asc } from 'drizzle-orm';

import {
  RegisterLocationRequest,
  RegisterProductRequest,
  type LocationView,
  type ProductView,
} from '@repo/contracts/scm';
import { DB } from '@repo/nest-kit/infra.module';
import { zod } from '@repo/nest-kit/zod.pipe';

import type { Db } from '../db/db.js';
import { locations, products } from '../db/schema.js';

/** 기준 정보. 같은 키로 다시 등록하면 내용을 갱신한다. */
@Controller()
export class CatalogController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Post('products')
  async registerProduct(
    @Body(zod(RegisterProductRequest)) body: RegisterProductRequest,
  ): Promise<ProductView> {
    await this.db
      .insert(products)
      .values({ ...body, createdAt: new Date() })
      .onDuplicateKeyUpdate({ set: { name: body.name } });
    return body;
  }

  @Get('products')
  listProducts(): Promise<ProductView[]> {
    return this.db
      .select({ sku: products.sku, name: products.name })
      .from(products)
      .orderBy(asc(products.sku));
  }

  @Post('locations')
  async registerLocation(
    @Body(zod(RegisterLocationRequest)) body: RegisterLocationRequest,
  ): Promise<LocationView> {
    await this.db
      .insert(locations)
      .values({ ...body, createdAt: new Date() })
      .onDuplicateKeyUpdate({ set: { name: body.name, type: body.type, partner: body.partner } });
    return body;
  }

  @Get('locations')
  listLocations(): Promise<LocationView[]> {
    return this.db
      .select({
        code: locations.code,
        name: locations.name,
        type: locations.type,
        partner: locations.partner,
      })
      .from(locations)
      .orderBy(asc(locations.code));
  }
}
