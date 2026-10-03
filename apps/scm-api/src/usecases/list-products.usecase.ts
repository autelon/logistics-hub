import { Injectable } from '@nestjs/common';

import type { ProductView } from '@repo/contracts/scm';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';

@Injectable()
export class ListProductsUsecase {
  constructor(private readonly catalog: CatalogService) {}

  async execute(): Promise<ProductView[]> {
    const products = await this.catalog.listProducts();
    return products.map(({ sku, name }) => ({ sku, name }));
  }
}
