import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { newId } from '@repo/db-kit/columns';
import type { AnyDb, DbExecutor } from '@repo/db-kit/db';
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

/**
 * `nextPublicId` 는 `AnyDb` 를 받지만 `CurrentDb.get()` 은 repository 가 트랜잭션을 열지 못하게 `transaction` 을
 * 타입에서 뺀 `DbExecutor` 를 준다. 런타임 객체는 같은 Drizzle 연결(`run` 안이면 트랜잭션 핸들)이라 확인만 하고 넘긴다.
 * db-kit 이 `nextPublicId` 의 인자를 `DbExecutor` 로 받게 되면 이 함수는 지운다.
 */
const isDrizzleDb = (db: DbExecutor<typeof schema>): db is DbExecutor<typeof schema> & AnyDb =>
  'transaction' in db && typeof db.transaction === 'function';

@Injectable()
export class DrizzleServiceCaseRepository implements ServiceCaseRepository {
  constructor(@Inject(CurrentDb) private readonly db: CurrentDb<typeof schema>) {}

  async insert(draft: NewServiceCase): Promise<ServiceCase> {
    const db = this.db.get();
    if (!isDrizzleDb(db)) throw new Error('CurrentDb 가 Drizzle 연결이 아니다');
    const serviceCase: ServiceCase = {
      id: newId(),
      publicId: await nextPublicId(db, 'CASE', draft.openedAt),
      ...draft,
    };
    await db.insert(serviceCases).values(serviceCase);
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
