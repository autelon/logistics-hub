import { Inject, Injectable } from '@nestjs/common';

import type { DoaConfirmed, DoaDisposition, UnitScrapped } from '@repo/contracts/as';
import { makeEvent, Topics } from '@repo/contracts/common';
import { EventOutbox } from '@repo/nest-kit/event-outbox';

import { asError } from '../../../errors.js';
import {
  confirmDoa,
  openCase,
  reject,
  scrap,
  type CaseIntake,
  type ServiceCase,
} from '../domain/service-case.js';
import { ServiceCaseRepository } from '../domain/service-case.repository.js';

/** 목록 조회는 최근 접수 50건까지만 돌려준다. */
const LIST_LIMIT = 50;

@Injectable()
export class ServiceCaseService {
  constructor(
    @Inject(ServiceCaseRepository) private readonly cases: ServiceCaseRepository,
    @Inject(EventOutbox) private readonly outbox: EventOutbox,
  ) {}

  open(intake: CaseIntake): Promise<ServiceCase> {
    return this.cases.insert(openCase(intake, new Date()));
  }

  list(): Promise<ServiceCase[]> {
    return this.cases.findRecent(LIST_LIMIT);
  }

  async get(id: string): Promise<ServiceCase> {
    const found = await this.cases.findById(id);
    if (!found) throw asError('CASE_NOT_FOUND', `Case ${id} not found`);
    return found;
  }

  /** 초기 불량으로 판정. SCM(제품 이력)과 OMS(교체 출고)가 이 이벤트를 받는다. */
  async confirmDoa(id: string, disposition: DoaDisposition): Promise<ServiceCase> {
    const current = await this.lock(id);
    const confirmedAt = new Date();
    const updated = confirmDoa(current, disposition, confirmedAt);
    if (!updated) throw asError('CASE_NOT_OPEN', `Case ${id} is ${current.status}, expected OPEN`);
    await this.cases.save(updated);
    await this.outbox.enqueue(
      Topics.asCaseEvents,
      updated.serialNumber,
      makeEvent('as.doa.confirmed', {
        caseId: updated.id,
        serialNumber: updated.serialNumber,
        origin: updated.origin,
        disposition,
        confirmedAt: confirmedAt.toISOString(),
      }) satisfies DoaConfirmed,
    );
    return updated;
  }

  async reject(id: string): Promise<ServiceCase> {
    const current = await this.lock(id);
    const updated = reject(current);
    if (!updated) throw asError('CASE_NOT_OPEN', `Case ${id} is ${current.status}, expected OPEN`);
    await this.cases.save(updated);
    return updated;
  }

  /** 폐기 처분으로 확정된 불량품을 실제로 폐기했음을 기록한다. */
  async scrap(id: string): Promise<ServiceCase> {
    const current = await this.lock(id);
    const scrappedAt = new Date();
    const updated = scrap(current, scrappedAt);
    if (!updated) {
      throw asError(
        'CASE_NOT_SCRAPPABLE',
        `Case ${id} is ${current.status}/${current.disposition ?? 'no disposition'}, expected DOA_CONFIRMED/SCRAP`,
      );
    }
    await this.cases.save(updated);
    await this.outbox.enqueue(
      Topics.asCaseEvents,
      updated.serialNumber,
      makeEvent('as.unit.scrapped', {
        caseId: updated.id,
        serialNumber: updated.serialNumber,
        scrappedAt: scrappedAt.toISOString(),
      }) satisfies UnitScrapped,
    );
    return updated;
  }

  private async lock(id: string): Promise<ServiceCase> {
    const found = await this.cases.findByIdForUpdate(id);
    if (!found) throw asError('CASE_NOT_FOUND', `Case ${id} not found`);
    return found;
  }
}
