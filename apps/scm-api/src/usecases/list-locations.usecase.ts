import { Injectable } from '@nestjs/common';

import type { LocationView } from '@repo/contracts/scm';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';
import { LocationPolicyService } from '../domains/catalog/application/location-policy.service.js';
import { resolvePolicy } from '../domains/catalog/domain/location-policy.js';
import { toLocationView } from './location-view.js';

@Injectable()
export class ListLocationsUsecase {
  constructor(
    private readonly catalog: CatalogService,
    private readonly policies: LocationPolicyService,
  ) {}

  async execute(): Promise<LocationView[]> {
    const [locations, policies] = await Promise.all([
      this.catalog.listLocations(),
      this.policies.policiesByLocation(),
    ]);
    // 프로필 행이 없는 거점은 기본값으로 동작한다.
    return locations.map((location) =>
      toLocationView(location, policies.get(location.id) ?? resolvePolicy(undefined)),
    );
  }
}
