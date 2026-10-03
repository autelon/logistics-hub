import type { LocationType, TrackingMode } from '@repo/contracts/scm';

/** 기준 정보: 제품. 코드(sku)는 unique, 다른 테이블은 id 로 참조한다. */
export interface Product {
  id: string;
  sku: string;
  name: string;
  trackingMode: TrackingMode;
  createdAt: Date;
}

/** 기준 정보: 재고가 물리적으로 있을 수 있는 곳. 운영 주체는 외부 업체다. */
export interface Location {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  partner: string;
  createdAt: Date;
}

export type ProductInput = Pick<Product, 'sku' | 'name' | 'trackingMode'>;
export type LocationInput = Pick<Location, 'code' | 'name' | 'type' | 'partner'>;
