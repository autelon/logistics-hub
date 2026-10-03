import { Injectable } from '@nestjs/common';

import type { StockRow } from '@repo/contracts/scm';

import { UnitService } from '../domains/unit/application/unit.service.js';
import { WarehouseService } from '../domains/warehouse/application/warehouse.service.js';

/**
 * 통합 재고. 시리얼 제품은 개체 상태별 개수, 시리얼 없는 제품은 수량 원장의 합을 같은 형태로 합친다.
 * `trackingMode` 는 행의 근거를 뜻한다: 개체(`units`)로 센 행은 `SERIAL`, 원장으로 합산한 행은 제품의 추적 방식이다.
 * 시리얼 쪽 행이 먼저(SKU · 거점 · 상태 · 등록 여부 순), 그다음 수량 쪽 행(SKU · 거점 · 로트 · 재고 상태 순)이다.
 */
@Injectable()
export class GetStockUsecase {
  constructor(
    private readonly units: UnitService,
    private readonly warehouse: WarehouseService,
  ) {}

  async execute(): Promise<StockRow[]> {
    const [unitCounts, balances] = await Promise.all([
      this.units.stock(),
      this.warehouse.balances(),
    ]);
    return [
      ...unitCounts.map(({ sku, locationCode, status, registered, quantity }): StockRow => ({
        sku,
        trackingMode: 'SERIAL',
        locationCode,
        status,
        registered,
        lotNo: null,
        stockStatus: null,
        quantity,
      })),
      ...balances.map(
        ({ sku, trackingMode, locationCode, lotNo, stockStatus, quantity }): StockRow => ({
          sku,
          trackingMode,
          locationCode,
          status: 'IN_STOCK',
          registered: null,
          lotNo,
          stockStatus,
          quantity,
        }),
      ),
    ];
  }
}
