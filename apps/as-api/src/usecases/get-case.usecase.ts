import { Injectable } from '@nestjs/common';

import type { ServiceCaseView } from '@repo/contracts/as';

import { ServiceCaseService } from '../domains/service-case/application/service-case.service.js';
import { toServiceCaseView } from './service-case-view.js';

@Injectable()
export class GetCaseUsecase {
  constructor(private readonly cases: ServiceCaseService) {}

  async execute(id: string): Promise<ServiceCaseView> {
    return toServiceCaseView(await this.cases.get(id));
  }
}
