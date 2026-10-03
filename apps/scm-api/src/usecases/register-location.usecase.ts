import { Inject, Injectable } from '@nestjs/common';

import type { LocationView, RegisterLocationRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { LocationPolicyService } from '../domains/catalog/application/location-policy.service.js';
import { toLocationView } from './location-view.js';

/** 같은 code 로 다시 등록하면 내용을 갱신한다. 능력 프로필은 건드리지 않는다. */
@Injectable()
export class RegisterLocationUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly catalog: CatalogService,
    private readonly policies: LocationPolicyService,
  ) {}

  execute(request: RegisterLocationRequest): Promise<LocationView> {
    return this.tx.run(async () => {
      await this.catalog.registerLocation(request);
      const location = await this.catalog.locationByCode(request.code);
      return toLocationView(location, await this.policies.policyOf(location.id));
    });
  }
}
