import { Injectable } from '@nestjs/common';

import type { LocationView } from '@repo/contracts/scm';

import { CatalogService } from '../domains/catalog/application/catalog.service.js';

@Injectable()
export class ListLocationsUsecase {
  constructor(private readonly catalog: CatalogService) {}

  async execute(): Promise<LocationView[]> {
    const locations = await this.catalog.listLocations();
    return locations.map(({ code, name, type, partner }) => ({ code, name, type, partner }));
  }
}
