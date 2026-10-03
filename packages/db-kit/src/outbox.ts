import { asc, inArray, isNull } from 'drizzle-orm';
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

  /** 미발행 이벤트를 id(=시간) 순으로 발행한다. 발행한 건수를 돌려준다. */
  async flush(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outboxEvents)
        .where(isNull(outboxEvents.publishedAt))
        .orderBy(asc(outboxEvents.id))
        .limit(this.options.batchSize ?? 50)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return 0;

      for (const row of rows) {
        await this.bus.publish(row.topic, { key: row.key, value: row.payload });
      }
      await tx
        .update(outboxEvents)
        .set({ publishedAt: new Date() })
        .where(
          inArray(
            outboxEvents.id,
            rows.map((r) => r.id),
          ),
        );
      return rows.length;
    });
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
