import { Injectable } from '@nestjs/common';

import type { SellableView } from '@repo/contracts/oms';

import { SellableService } from '../domains/sellable/application/sellable.service.js';

@Injectable()
export class ListSellablesUsecase {
  constructor(private readonly sellables: SellableService) {}

  async execute(): Promise<SellableView[]> {
    const sellables = await this.sellables.list();
    return sellables.map(({ code, name, kind, components }) => ({ code, name, kind, components }));
  }
}
