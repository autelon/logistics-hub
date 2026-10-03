import { Inject, Injectable } from '@nestjs/common';

import type { RegisterUnitsRequest, RegisterUnitsResult } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { UnitService, type RegistrationTarget } from '../domains/unit/application/unit.service.js';
import { decideRegistration } from '../domains/unit/domain/unit-registration.js';

/**
 * 운영자가 시리얼 목록을 제품으로 등록한다 (우리가 내리는 명령이라 전제 조건을 검사하고 거절할 수 있다).
 * 등록할 수 있는 것만 등록하고, 나머지는 사유와 함께 돌려준다 (`decideRegistration`).
 *
 * 한 트랜잭션 안에서: 시리얼을 한꺼번에 잠그고 → 판정하고 → `REGISTERED` 사실을 대량으로 기록하고(제품당 다시 접기 한 번)
 * → 등록된 것이 하나라도 있으면 기기 요청(REGISTER) 하나를 만든다. 요청은 배치당 하나다.
 * 개체마다 활성 여부 전후를 비교해 요청을 만드는 일반 경로(record·correct)는 여기서 쓰지 않는다 (제품당 요청이 생기므로).
 *
 * 같은 시리얼이 목록에 여러 번 있으면 한 번만 본다.
 */
@Injectable()
export class RegisterUnitsUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly units: UnitService,
    private readonly deviceRequests: DeviceRequestService,
  ) {}

  execute(request: RegisterUnitsRequest): Promise<RegisterUnitsResult> {
    const serialNumbers = [...new Set(request.serialNumbers)];
    return this.tx.run(async () => {
      const locked = await this.units.lockBySerials(serialNumbers);
      const unitBySerial = new Map(locked.map((unit) => [unit.serialNumber, unit]));
      const products = await this.catalog.productsOf(locked.map((unit) => unit.productId));

      const targets: RegistrationTarget[] = [];
      const excluded: RegisterUnitsResult['excluded'] = [];
      for (const serialNumber of serialNumbers) {
        const unit = unitBySerial.get(serialNumber);
        const product = unit && products.get(unit.productId);
        if (unit && !product) {
          // 외래 키로 보장되는 값이라 서비스 에러가 아니라 데이터 무결성 문제다.
          throw new Error(
            `Product ${unit.productId} referenced by unit ${serialNumber} is missing`,
          );
        }
        const decision = decideRegistration(unit, product?.trackingMode ?? 'SERIAL');
        if (decision === 'REGISTRABLE' && unit && product) targets.push({ unit, product });
        else if (decision !== 'REGISTRABLE') excluded.push({ serialNumber, reason: decision });
      }

      await this.units.registerAll(targets, request.actor);

      const registered = targets.map(({ unit }) => unit.serialNumber);
      if (targets.length === 0) return { requestId: null, registered, excluded };

      const deviceRequest = await this.deviceRequests.create({
        type: 'REGISTER',
        reason: 'REGISTRATION',
        createdBy: request.actor,
        items: targets.map(({ unit, product }) => ({
          unitId: unit.id,
          serialNumber: unit.serialNumber,
          sku: product.sku,
        })),
      });
      return { requestId: deviceRequest.id, registered, excluded };
    });
  }
}
