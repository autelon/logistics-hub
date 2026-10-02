import type { DbExecutor } from '@repo/db-kit/db';

/**
 * repository(`infra`)가 쿼리를 실행할 대상을 얻는 포트.
 *
 * `get()` 은 `TransactionRunner.run` 안이면 그 트랜잭션 핸들을, 밖이면 루트 연결을 준다.
 * 쿼리할 때마다 `this.db.get()` 을 다시 부른다. 반환값을 필드에 보관하면 트랜잭션에 참여하지 못한다.
 * 타입 인자에 서비스의 스키마를 주면 결과 타입이 그대로 추론된다: `CurrentDb<typeof schema>`.
 */
export interface CurrentDb<TSchema extends Record<string, unknown>> {
  get(): DbExecutor<TSchema>;
}
export const CurrentDb = Symbol('CurrentDb');
