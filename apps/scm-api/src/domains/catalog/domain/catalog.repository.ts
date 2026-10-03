import type { Location, LocationInput, Product, ProductInput } from './catalog.js';

export interface CatalogRepository {
  /** 같은 sku 가 있으면 내용을 갱신한다 (id 는 처음 것이 유지된다). */
  upsertProduct(input: ProductInput): Promise<void>;
  listProducts(): Promise<Product[]>;
  findProductBySku(sku: string): Promise<Product | undefined>;
  findProductsBySkus(skus: readonly string[]): Promise<Product[]>;
  findProductById(id: string): Promise<Product | undefined>;
  findProductsByIds(ids: readonly string[]): Promise<Product[]>;

  /** 같은 code 가 있으면 내용을 갱신한다 (id 는 처음 것이 유지된다). */
  upsertLocation(input: LocationInput): Promise<void>;
  listLocations(): Promise<Location[]>;
  findLocationByCode(code: string): Promise<Location | undefined>;
  /**
   * 거점 행을 잠그고 읽는다. 같은 거점을 바꾸는 트랜잭션을 줄 세우는 용도라 트랜잭션의 첫 쿼리로 부른다
   * (REPEATABLE READ 의 스냅샷은 첫 일반 읽기 때 잡히므로, 그 뒤에 잠금을 얻으면 먼저 커밋된 변경을 못 본다).
   */
  findLocationByCodeForUpdate(code: string): Promise<Location | undefined>;
  findLocationsByCodes(codes: readonly string[]): Promise<Location[]>;
  findLocationById(id: string): Promise<Location | undefined>;
}
export const CatalogRepository = Symbol('CatalogRepository');
