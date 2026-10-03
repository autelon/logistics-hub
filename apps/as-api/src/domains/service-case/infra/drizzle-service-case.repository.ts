import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import { nextPublicId } from '@repo/db-kit/public-id';
import { CurrentDb } from '@repo/nest-kit/current-db';

import type * as schema from '../../../db/schema.js';
import { serviceCases } from '../../../db/schema.js';
import type { NewServiceCase, ServiceCase } from '../domain/service-case.js';
import type { ServiceCaseRepository } from '../domain/service-case.repository.js';

type CaseRow = typeof serviceCases.$inferSelect;

const toServiceCase = (row: CaseRow): ServiceCase => ({
  id: row.id,
  publicId: row.publicId,
  serialNumber: row.serialNumber,
  origin: row.origin,
  symptom: row.symptom,
  relatedCaseId: row.relatedCaseId,
  status: row.status,
  disposition: row.disposition,
  openedAt: row.openedAt,
  confirmedAt: row.confirmedAt,
  scrappedAt: row.scrappedAt,
});

@Injectable()
export class DrizzleServiceCaseRepository implements ServiceCaseRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async insert(draft: NewServiceCase): Promise<ServiceCase> {
    const serviceCase: ServiceCase = {
      id: newId(),
      publicId: await nextPublicId(this.db.get(), 'CASE', draft.openedAt),
      ...draft,
    };
    await this.db.get().insert(serviceCases).values(serviceCase);
    return serviceCase;
  }

  async findRecent(limit: number): Promise<ServiceCase[]> {
    const rows = await this.db
      .get()
      .select()
      .from(serviceCases)
      .orderBy(desc(serviceCases.id))
      .limit(limit);
    return rows.map(toServiceCase);
  }

  async findById(id: string): Promise<ServiceCase | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(serviceCases)
      .where(eq(serviceCases.id, id))
      .limit(1);
    return row && toServiceCase(row);
  }

  async findByIdForUpdate(id: string): Promise<ServiceCase | undefined> {
    const [row] = await this.db
      .get()
      .select()
      .from(serviceCases)
      .where(eq(serviceCases.id, id))
      .for('update');
    return row && toServiceCase(row);
  }

  async save(serviceCase: ServiceCase): Promise<void> {
    const { id, ...values } = serviceCase;
    await this.db.get().update(serviceCases).set(values).where(eq(serviceCases.id, id));
  }
}
