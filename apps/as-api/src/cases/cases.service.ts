import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import type {
  ConfirmDoaRequest,
  DoaConfirmed,
  OpenCaseRequest,
  ServiceCaseView,
  UnitScrapped,
} from '@repo/contracts/as';
import { makeEvent, Topics } from '@repo/contracts/common';
import { newId } from '@repo/db-kit/columns';
import { enqueue } from '@repo/db-kit/outbox';
import { DB } from '@repo/nest-kit/infra.module';

import type { Db, Tx } from '../db/db.js';
import { serviceCases } from '../db/schema.js';

type CaseRow = typeof serviceCases.$inferSelect;

const toView = (row: CaseRow): ServiceCaseView => ({
  ...row,
  openedAt: row.openedAt.toISOString(),
  confirmedAt: row.confirmedAt?.toISOString() ?? null,
  scrappedAt: row.scrappedAt?.toISOString() ?? null,
});

@Injectable()
export class CasesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async open(request: OpenCaseRequest): Promise<ServiceCaseView> {
    const row: CaseRow = {
      id: newId(),
      ...request,
      status: 'OPEN',
      disposition: null,
      openedAt: new Date(),
      confirmedAt: null,
      scrappedAt: null,
    };
    await this.db.insert(serviceCases).values(row);
    return toView(row);
  }

  async list(): Promise<ServiceCaseView[]> {
    const rows = await this.db.select().from(serviceCases).orderBy(desc(serviceCases.id)).limit(50);
    return rows.map(toView);
  }

  async get(id: string): Promise<ServiceCaseView> {
    const [row] = await this.db.select().from(serviceCases).where(eq(serviceCases.id, id)).limit(1);
    if (!row) throw new NotFoundException(`Case ${id} not found`);
    return toView(row);
  }

  /** 초기 불량으로 판정. SCM(제품 이력)과 OMS(교체 출고)가 이 이벤트를 받는다. */
  async confirmDoa(id: string, request: ConfirmDoaRequest): Promise<ServiceCaseView> {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== 'OPEN') {
        throw new ConflictException(`Case ${id} is ${current.status}, expected OPEN`);
      }
      const updated: CaseRow = {
        ...current,
        status: 'DOA_CONFIRMED',
        disposition: request.disposition,
        confirmedAt: new Date(),
      };
      await this.save(tx, updated);
      await enqueue(
        tx,
        Topics.asCaseEvents,
        updated.serialNumber,
        makeEvent('as.doa.confirmed', {
          caseId: updated.id,
          serialNumber: updated.serialNumber,
          origin: updated.origin,
          disposition: request.disposition,
          confirmedAt: updated.confirmedAt!.toISOString(),
        }) satisfies DoaConfirmed,
      );
      return toView(updated);
    });
  }

  async reject(id: string): Promise<ServiceCaseView> {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== 'OPEN') {
        throw new ConflictException(`Case ${id} is ${current.status}, expected OPEN`);
      }
      const updated: CaseRow = { ...current, status: 'REJECTED' };
      await this.save(tx, updated);
      return toView(updated);
    });
  }

  /** 폐기 처분으로 확정된 불량품을 실제로 폐기했음을 기록한다. */
  async scrap(id: string): Promise<ServiceCaseView> {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (current.status !== 'DOA_CONFIRMED' || current.disposition !== 'SCRAP') {
        throw new ConflictException(
          `Case ${id} is ${current.status}/${current.disposition ?? 'no disposition'}, expected DOA_CONFIRMED/SCRAP`,
        );
      }
      const updated: CaseRow = { ...current, status: 'SCRAPPED', scrappedAt: new Date() };
      await this.save(tx, updated);
      await enqueue(
        tx,
        Topics.asCaseEvents,
        updated.serialNumber,
        makeEvent('as.unit.scrapped', {
          caseId: updated.id,
          serialNumber: updated.serialNumber,
          scrappedAt: updated.scrappedAt!.toISOString(),
        }) satisfies UnitScrapped,
      );
      return toView(updated);
    });
  }

  private async lock(tx: Tx, id: string): Promise<CaseRow> {
    const [row] = await tx.select().from(serviceCases).where(eq(serviceCases.id, id)).for('update');
    if (!row) throw new NotFoundException(`Case ${id} not found`);
    return row;
  }

  private async save(tx: Tx, row: CaseRow) {
    const { id, ...values } = row;
    await tx.update(serviceCases).set(values).where(eq(serviceCases.id, id));
  }
}
