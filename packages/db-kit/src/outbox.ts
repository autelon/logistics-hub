import { asc, inArray, isNull, sql } from 'drizzle-orm';
import { index, json, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import type { MessageBus } from '@repo/messaging/message-bus';

import { idColumn, newId, utcDateTime } from './columns.js';
import type { AnyDb, QueryExecutor } from './db.js';

/**
 * 트랜잭셔널 아웃박스. 업무 데이터와 같은 트랜잭션에 이벤트를 적어 두고,
 * 커밋된 것만 릴레이가 브로커로 보낸다. "DB 는 바뀌었는데 이벤트는 안 나감"을 막는다.
 */
export const outboxEvents = mysqlTable(
  'outbox_events',
  {
    id: idColumn().primaryKey(),
    topic: varchar({ length: 100 }).notNull(),
    key: varchar({ length: 200 }).notNull(),
    payload: json().$type<unknown>().notNull(),
    createdAt: utcDateTime().notNull(),
    publishedAt: utcDateTime(),
  },
  (t) => [index('outbox_unpublished_idx').on(t.publishedAt, t.id)],
);

/** application 서비스에서는 tx 를 넘기지 않는 `EventOutbox.enqueue` (`@repo/nest-kit/event-outbox`) 를 쓴다. */
export const enqueue = async (tx: QueryExecutor, topic: string, key: string, payload: unknown) => {
  await tx.insert(outboxEvents).values({ id: newId(), topic, key, payload, createdAt: new Date() });
};

export class OutboxRelay {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  private readonly db: AnyDb;
  private readonly bus: MessageBus;
  private readonly options: { intervalMs?: number; batchSize?: number };

  constructor(
    db: AnyDb,
    bus: MessageBus,
    options: { intervalMs?: number; batchSize?: number } = {},
  ) {
    this.db = db;
    this.bus = bus;
    this.options = options;
  }

  start() {
    this.timer ??= setInterval(() => void this.tick(), this.options.intervalMs ?? 500);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * 미발행 이벤트를 id(=시간) 순으로 발행하고, 발행이 끝난 것만 `published_at` 을 찍는다. 발행한 건수를 돌려준다.
   *
   * 릴레이끼리의 배타는 행 잠금이 아니라 MySQL 이름 잠금(`GET_LOCK`, 이 DB 이름 기준)으로 잡는다.
   * `SELECT ... FOR UPDATE` 로 잡으면 `outbox_unpublished_idx` 의 "아직 발행 안 됨" 구간에 갭 잠금이 걸려,
   * 발행하는 동안 아웃박스에 적는 모든 업무 트랜잭션이 멈춘다(브로커가 느리면 그만큼, 핸들러가 같은 프로세스에서
   * 돌면 서로 기다리다 lock wait timeout). 이름 잠금은 행을 잠그지 않아 적는 쪽이 막히지 않는다.
   *
   * 보장:
   * - at-least-once: 브로커가 받은 뒤에만 표시한다. 그 사이에 죽으면 다음 릴레이가 다시 보낸다(소비자는 멱등).
   * - 한 릴레이 안에서는 `id` 순서로 보낸다. 중간에 실패하면 거기까지만 표시하고 멈춘다.
   * - 다른 릴레이 인스턴스가 잠금을 쥐고 있으면 이번 flush 는 0 을 돌려주고 건너뛴다. 잠금은 연결에 묶여 있어
   *   쥔 쪽이 죽으면 풀리고, 그때 표시 안 된 것이 다시 나갈 수 있다(= 죽은 뒤에만 중복).
   */
  async flush(): Promise<number> {
    // 이름 잠금은 연결 단위라 같은 연결로 묶어 두려고 트랜잭션을 쓴다. 읽기는 스냅숏이라 행을 잠그지 않는다.
    const { published, failure } = await this.db.transaction(async (tx) => {
      const [lock] = await tx
        .select({ acquired: sql<number>`GET_LOCK(CONCAT('outbox_relay:', DATABASE()), 0)` })
        .from(sql`dual`);
      if (lock?.acquired !== 1) return { published: 0, failure: undefined };
      try {
        return await this.publishBatch(tx);
      } finally {
        await tx
          .select({ released: sql`RELEASE_LOCK(CONCAT('outbox_relay:', DATABASE()))` })
          .from(sql`dual`);
      }
    });
    if (failure) throw failure.error;
    return published;
  }

  private async publishBatch(
    tx: AnyDb,
  ): Promise<{ published: number; failure: { error: unknown } | undefined }> {
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .orderBy(asc(outboxEvents.id))
      .limit(this.options.batchSize ?? 50);

    const publishedIds: string[] = [];
    let failure: { error: unknown } | undefined;
    for (const row of rows) {
      try {
        await this.bus.publish(row.topic, { key: row.key, value: row.payload });
      } catch (error) {
        failure = { error };
        break;
      }
      publishedIds.push(row.id);
    }
    if (publishedIds.length > 0) {
      await tx
        .update(outboxEvents)
        .set({ publishedAt: new Date() })
        .where(inArray(outboxEvents.id, publishedIds));
    }
    return { published: publishedIds.length, failure };
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      while ((await this.flush()) > 0);
    } catch (error) {
      console.error('[outbox] relay failed', error);
    } finally {
      this.running = false;
    }
  }
}
