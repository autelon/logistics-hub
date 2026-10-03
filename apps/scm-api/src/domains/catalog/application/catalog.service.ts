import { Inject, Injectable } from '@nestjs/common';

import { scmError } from '../../../errors.js';
import type { Location, LocationInput, Product, ProductInput } from '../domain/catalog.js';
import { CatalogRepository } from '../domain/catalog.repository.js';

/**
 * 기준 정보(제품, 거점)의 등록·조회와 코드 ↔ id 해석.
 * 다른 도메인(unit)이 제품·거점을 참조할 때는 usecase 가 여기서 해석한 값을 넘긴다.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(CatalogRepository) private readonly catalog: CatalogRepository) {}

  registerProduct(input: ProductInput): Promise<void> {
    return this.catalog.upsertProduct(input);
  }

  listProducts(): Promise<Product[]> {
    return this.catalog.listProducts();
  }

  registerLocation(input: LocationInput): Promise<void> {
    return this.catalog.upsertLocation(input);
  }

  listLocations(): Promise<Location[]> {
    return this.catalog.listLocations();
  }

  /** 등록된 SKU 여야 한다. */
  async resolveProduct(sku: string): Promise<Product> {
    const product = await this.catalog.findProductBySku(sku);
    if (!product) throw scmError('UNKNOWN_SKU', `Unknown sku ${sku}`);
    return product;
  }

  /** 다른 테이블이 외래 키로 가리키는 제품. 없으면 데이터 무결성이 깨진 것이라 서비스 에러가 아니다. */
  async productOf(productId: string): Promise<Product> {
    const product = await this.catalog.findProductById(productId);
    if (!product) throw new Error(`Product ${productId} referenced by a unit does not exist`);
    return product;
  }

  /** 거점 코드를 해석한다. 코드가 없으면(null) 거점 없는 사실이다. */
  async resolveLocation(code: string | null): Promise<Location | null> {
    if (!code) return null;
    const location = await this.catalog.findLocationByCode(code);
    if (!location) throw scmError('UNKNOWN_LOCATION', `Unknown location ${code}`);
    return location;
  }

  async locationCodeOf(locationId: string | null): Promise<string | null> {
    if (!locationId) return null;
    const location = await this.catalog.findLocationById(locationId);
    return location?.code ?? null;
  }
}
