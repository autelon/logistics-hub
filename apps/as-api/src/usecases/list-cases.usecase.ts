import { Injectable } from '@nestjs/common';

import type { ServiceCaseView } from '@repo/contracts/as';

import { ServiceCaseService } from '../domains/service-case/application/service-case.service.js';
import { toServiceCaseView } from './service-case-view.js';

@Injectable()
export class ListCasesUsecase {
  constructor(private readonly cases: ServiceCaseService) {}

  async execute(): Promise<ServiceCaseView[]> {
    return (await this.cases.list()).map(toServiceCaseView);
  }
}
