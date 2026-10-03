import { Inject, Injectable } from '@nestjs/common';

import type { RecordStockMovementsRequest, RecordStockMovementsResult } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { WarehouseService } from '../domains/warehouse/application/warehouse.service.js';
import { StockMovementConflict } from '../domains/warehouse/domain/stock-movement-conflict.js';
import {
  isQuantityTracked,
  type NewStockMovement,
} from '../domains/warehouse/domain/stock-movement.js';
import { scmError } from '../errors.js';
import { retryOnConflict } from './retry-on-conflict.js';

/**
 * 수량 이동을 한 트랜잭션으로 기록한다. 업체 배치 하나의 이동을 묶어 받는 입구다 (docs/06-inbound-design.md).
 *
 * SKU 와 거점 코드는 고유한 것마다 한 번만 찾고(항목마다 찾지 않는다), 요청 순서대로 검사해서
 * 처음 걸리는 항목에서 멈춘다. 거절하면 아무것도 기록하지 않고, 에러 `details` 에 항목 번호(`index`, 0부터)를 담는다.
 * 시리얼 제품은 개체 사실로만 추적하므로 거절한다 (`QUANTITY_TRACKING_ONLY`).
 * 같은 idempotencyKey 는 한 번만 기록한다 (`WarehouseService.record`).
 *
 * 같은 키의 요청이 동시에 오면 진 쪽은 저장에서 `StockMovementConflict` 로 실패하고 트랜잭션이 통째로 롤백된다.
 * 그러면 요청을 처음부터 다시 한다. 이긴 쪽이 이미 커밋했으므로 다시 할 때는 그 키들이 저장된 것으로 보여
 * 중복(`duplicate: true`)으로 돌아온다. 한 항목이라도 겹치면 요청 전체를 다시 하므로 겹치지 않은 항목은 그때 기록된다.
 */
@Injectable()
export class RecordStockMovementsUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly warehouse: WarehouseService,
  ) {}

  execute(request: RecordStockMovementsRequest): Promise<RecordStockMovementsResult> {
    return retryOnConflict(StockMovementConflict, () => this.attempt(request));
  }

  private attempt(request: RecordStockMovementsRequest): Promise<RecordStockMovementsResult> {
    const { movements } = request;
    return this.tx.run(async () => {
      const products = await this.catalog.productsBySku(movements.map((m) => m.sku));
      const locations = await this.catalog.locationsByCode(
        movements.flatMap((m) => [m.fromLocationCode, m.toLocationCode]).filter((c) => c !== null),
      );
      const now = new Date();

      const items = movements.map((m, index): NewStockMovement => {
        const product = products.get(m.sku);
        if (!product) throw scmError('UNKNOWN_SKU', `Unknown sku ${m.sku}`, { index, sku: m.sku });
        if (!isQuantityTracked(product.trackingMode)) {
          throw scmError(
            'QUANTITY_TRACKING_ONLY',
            `${m.sku} is serial-tracked; report its movements as unit events`,
            { index, sku: m.sku },
          );
        }
        const locationId = (code: string | null): string | null => {
          if (code === null) return null;
          const location = locations.get(code);
          if (!location) {
            throw scmError('UNKNOWN_LOCATION', `Unknown location ${code}`, {
              index,
              locationCode: code,
            });
          }
          return location.id;
        };
        return {
          productId: product.id,
          lotNo: m.lotNo,
          fromLocationId: locationId(m.fromLocationCode),
          toLocationId: locationId(m.toLocationCode),
          quantity: m.quantity,
          stockStatus: m.stockStatus,
          reason: m.reason,
          occurredAt: new Date(m.occurredAt),
          recordedAt: now,
          source: m.source,
          idempotencyKey: m.idempotencyKey ?? null,
          note: m.note,
          reversesMovementId: null,
        };
      });

      return { movements: await this.warehouse.record(items) };
    });
  }
}
