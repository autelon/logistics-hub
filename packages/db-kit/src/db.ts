import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

/**
 * 스키마에 상관없이 쿼리를 실행할 수 있는 대상. 트랜잭션 핸들도 여기에 들어맞는다.
 * 공용 테이블(outbox, inbox)을 다루는 코드만 이 타입을 쓰고, 서비스 코드는 자기 스키마 타입을 쓴다.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyDb = MySqlDatabase<any, any, any, any>;

export const createDb = <TSchema extends Record<string, unknown>>(url: string, schema: TSchema) => {
  const pool = mysql.createPool({ uri: url, timezone: 'Z', connectionLimit: 10 });
  const db = drizzle({ client: pool, schema, mode: 'default', casing: 'snake_case' });
  return { db, pool };
};
