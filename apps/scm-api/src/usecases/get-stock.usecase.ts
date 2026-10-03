import { Injectable } from '@nestjs/common';

import type { StockRow } from '@repo/contracts/scm';

import { UnitService } from '../domains/unit/application/unit.service.js';

/** SKU × 거점 × 상태 × 등록 여부별 수량. */
@Injectable()
export class GetStockUsecase {
  constructor(private readonly units: UnitService) {}

  async execute(): Promise<StockRow[]> {
    const rows = await this.units.stock();
    return rows.map(({ sku, locationCode, status, registered, quantity }) => ({
      sku,
      locationCode,
      status,
      registered,
      quantity,
    }));
  }
}
