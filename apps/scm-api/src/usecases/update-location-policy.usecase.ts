import { Inject, Injectable } from '@nestjs/common';

import type { LocationPolicy, UpdateLocationPolicyRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { LocationPolicyService } from '../domains/catalog/application/location-policy.service.js';

/** 거점 능력 프로필을 부분 변경한다. 우리가 내리는 명령이라 모르는 거점은 거절한다 (UNKNOWN_LOCATION). */
@Injectable()
export class UpdateLocationPolicyUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly policies: LocationPolicyService,
  ) {}

  execute(code: string, { actor, ...patch }: UpdateLocationPolicyRequest): Promise<LocationPolicy> {
    return this.tx.run(async () => {
      // 첫 쿼리로 거점 행을 잠가 같은 거점의 동시 변경을 줄 세운다.
      const location = await this.catalog.lockLocationByCode(code);
      return this.policies.update(location.id, patch, actor);
    });
  }
}
