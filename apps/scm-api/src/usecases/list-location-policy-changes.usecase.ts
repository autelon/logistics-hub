import { Injectable } from '@nestjs/common';

import type { LocationPolicyChangeView } from '@repo/contracts/scm';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { LocationPolicyService } from '../domains/catalog/application/location-policy.service.js';
import { toLocationPolicyChangeView } from './location-view.js';

@Injectable()
export class ListLocationPolicyChangesUsecase {
  constructor(
    private readonly catalog: CatalogService,
    private readonly policies: LocationPolicyService,
  ) {}

  async execute(code: string): Promise<LocationPolicyChangeView[]> {
    const location = await this.catalog.locationByCode(code);
    const changes = await this.policies.listChanges(location.id);
    return changes.map(toLocationPolicyChangeView);
  }
}
