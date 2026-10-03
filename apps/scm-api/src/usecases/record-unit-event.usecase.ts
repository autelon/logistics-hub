import { Inject, Injectable } from '@nestjs/common';

import type { RecordUnitEventRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { UnitService } from '../domains/unit/application/unit.service.js';
import type { ProductRef, Unit } from '../domains/unit/domain/unit.js';
import { scmError } from '../errors.js';

export interface RecordUnitEventResult {
  eventId: string;
  /** 같은 idempotencyKey 의 보고가 이미 기록되어 있어 새로 기록하지 않았다. */
  duplicate: boolean;
}

/**
 * 업체(연동 어댑터)가 보고한 사실 한 건을 기록한다.
 * 거점 코드와 SKU 는 catalog 에서 해석해 unit 에 넘긴다. 처음 보는 시리얼이면 등록부터 한다.
 * 이 사실 때문에 기기에서 활성이어야 하는지가 바뀌면(DOA 확정, 폐기 등) 기기 요청을 만든다.
 */
@Injectable()
export class RecordUnitEventUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly units: UnitService,
    private readonly deviceRequests: DeviceRequestService,
  ) {}

  execute(request: RecordUnitEventRequest): Promise<RecordUnitEventResult> {
    return this.tx.run(async () => {
      const duplicate = await this.units.findDuplicate(request.idempotencyKey);
      if (duplicate) return { eventId: duplicate.id, duplicate: true };

      const location = await this.catalog.resolveLocation(request.locationCode);
      const { unit, product } = await this.lockOrRegister(request.serialNumber, request.sku);

      const { event, deviceRequest } = await this.units.record(unit, product, {
        type: request.type,
        occurredAt: new Date(request.occurredAt),
        location,
        orderRef: request.orderRef,
        caseId: request.caseId,
        source: request.source,
        idempotencyKey: request.idempotencyKey ?? null,
        note: request.note,
      });
      if (deviceRequest) {
        await this.deviceRequests.create({
          type: deviceRequest,
          reason: request.type,
          createdBy: request.source.system,
          items: [{ unitId: unit.id, serialNumber: unit.serialNumber, sku: product.sku }],
        });
      }
      return { eventId: event.id, duplicate: false };
    });
  }

  /** 이미 아는 시리얼이면 잠그고(SKU 가 왔으면 등록된 것과 같아야 한다), 처음이면 SKU 로 등록한다. */
  private async lockOrRegister(
    serialNumber: string,
    sku: string | undefined,
  ): Promise<{ unit: Unit; product: ProductRef }> {
    const existing = await this.units.lockBySerial(serialNumber);
    if (existing) {
      const product = await this.catalog.productOf(existing.productId);
      if (sku && sku !== product.sku) {
        throw scmError(
          'SERIAL_SKU_MISMATCH',
          `Serial ${serialNumber} is registered as ${product.sku}, not ${sku}`,
        );
      }
      return { unit: existing, product };
    }

    if (!sku) throw scmError('SKU_REQUIRED', `sku is required for new serial ${serialNumber}`);
    const product = await this.catalog.resolveProduct(sku);
    return { unit: await this.units.register(serialNumber, product), product };
  }
}
