import { eq, sql } from 'drizzle-orm';
import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import { idColumn, newId } from './columns.js';
import type { AnyDb } from './db.js';

/**
 * 외부에 보여 주는 식별자(`ORD-2026-000123`)의 일련번호 카운터. 접두사 + 연도(UTC) 단위로 한 행이다.
 * 행 잠금으로 같은 범위의 동시 발급을 직렬화하고, 최종 보증은 발급받은 테이블의 `public_id` unique 인덱스다.
 */
export const publicIdCounters = mysqlTable('public_id_counters', {
  id: idColumn().primaryKey(),
  /** `<접두사>-<연도>`, 예: `ORD-2026`. */
  scope: varchar({ length: 32 }).notNull().unique(),
  last: int().notNull(),
});

export const publicIdColumn = () => varchar({ length: 32 });

/**
 * `<prefix>-<UTC 연도>-<6자리 일련번호>` 를 발급한다. 반드시 그 값을 저장하는 트랜잭션 안에서 부른다.
 * 카운터 행의 `FOR UPDATE` 잠금이 커밋까지 유지되어, 같은 범위의 동시 발급은 순서대로 처리되고 번호가 겹치지 않는다.
 * 자동 커밋 연결에서 부르면 잠금이 문장마다 풀려 같은 번호가 두 번 나올 수 있다.
 */
export const nextPublicId = async (tx: AnyDb, prefix: string, at: Date): Promise<string> => {
  const scope = `${prefix}-${at.getUTCFullYear()}`;
  // 그 범위의 첫 발급이면 행을 만든다. 이미 있으면 아무것도 바꾸지 않는다.
  await tx
    .insert(publicIdCounters)
    .values({ id: newId(), scope, last: 0 })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
  const [counter] = await tx
    .select({ last: publicIdCounters.last })
    .from(publicIdCounters)
    .where(eq(publicIdCounters.scope, scope))
    .for('update');
  const next = (counter?.last ?? 0) + 1;
  await tx.update(publicIdCounters).set({ last: next }).where(eq(publicIdCounters.scope, scope));
  return `${scope}-${String(next).padStart(6, '0')}`;
};
