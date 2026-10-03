import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { MySqlDatabase } from 'drizzle-orm/mysql-core';
import {
  drizzle,
  type MySql2PreparedQueryHKT,
  type MySql2QueryResultHKT,
} from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

/**
 * 스키마에 상관없이 쿼리를 실행할 수 있는 대상. 트랜잭션 핸들도 여기에 들어맞는다.
 * 공용 테이블(outbox, inbox)을 다루는 코드만 이 타입을 쓰고, 서비스 코드는 자기 스키마 타입을 쓴다.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyDb = MySqlDatabase<any, any, any, any>;

/**
 * 쿼리 하나를 실행할 수 있는 최소 인터페이스. 루트 연결, 트랜잭션 핸들, `CurrentDb.get()` 이 돌려주는
 * `DbExecutor` 가 모두 들어맞는다. 공용 테이블을 다루는 함수(아웃박스, 인박스, 공개 ID)의 인자 타입이다.
 */
export type QueryExecutor = Pick<AnyDb, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * 서비스 스키마로 타입이 잡힌 "쿼리를 실행할 수 있는 대상". 루트 연결(`MySql2Database<TSchema>`)과 그 트랜잭션 핸들이 모두 들어맞는다.
 * repository 가 `CurrentDb.get()` 으로 받는 타입이다. 트랜잭션은 usecase 만 열기 때문에 `transaction` 은 뺐다.
 */
export type DbExecutor<TSchema extends Record<string, unknown>> = Omit<
  MySqlDatabase<
    MySql2QueryResultHKT,
    MySql2PreparedQueryHKT,
    TSchema,
    ExtractTablesWithRelations<TSchema>
  >,
  'transaction'
>;

export const createDb = <TSchema extends Record<string, unknown>>(url: string, schema: TSchema) => {
  const pool = mysql.createPool({ uri: url, timezone: 'Z', connectionLimit: 10 });
  const db = drizzle({ client: pool, schema, mode: 'default', casing: 'snake_case' });
  return { db, pool };
};
