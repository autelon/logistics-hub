import { index, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import type { DoaDisposition, DoaOrigin, ServiceCaseStatus } from '@repo/contracts/as';
import { idColumn, utcDateTime } from '@repo/db-kit/columns';
import { outboxEvents } from '@repo/db-kit/outbox';

export { outboxEvents };

/** DOA 접수 한 건. 실제 AS 시스템의 접수·수리 흐름 중 연동에 필요한 부분만 흉내 낸다. */
export const serviceCases = mysqlTable(
  'service_cases',
  {
    id: idColumn().primaryKey(),
    serialNumber: varchar({ length: 100 }).notNull(),
    origin: varchar({ length: 32 }).$type<DoaOrigin>().notNull(),
    symptom: varchar({ length: 500 }).notNull(),
    relatedCaseId: idColumn(),
    status: varchar({ length: 32 }).$type<ServiceCaseStatus>().notNull(),
    disposition: varchar({ length: 32 }).$type<DoaDisposition>(),
    openedAt: utcDateTime().notNull(),
    confirmedAt: utcDateTime(),
    scrappedAt: utcDateTime(),
  },
  (t) => [index('service_cases_serial_idx').on(t.serialNumber)],
);
