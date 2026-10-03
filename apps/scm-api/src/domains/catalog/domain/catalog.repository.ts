import type { Location, LocationInput, Product, ProductInput } from './catalog.js';

export interface CatalogRepository {
  /** 같은 sku 가 있으면 내용을 갱신한다 (id 는 처음 것이 유지된다). */
  upsertProduct(input: ProductInput): Promise<void>;
  listProducts(): Promise<Product[]>;
  findProductBySku(sku: string): Promise<Product | undefined>;
  findProductById(id: string): Promise<Product | undefined>;

  /** 같은 code 가 있으면 내용을 갱신한다 (id 는 처음 것이 유지된다). */
  upsertLocation(input: LocationInput): Promise<void>;
  listLocations(): Promise<Location[]>;
  findLocationByCode(code: string): Promise<Location | undefined>;
  findLocationById(id: string): Promise<Location | undefined>;
}
export const CatalogRepository = Symbol('CatalogRepository');
