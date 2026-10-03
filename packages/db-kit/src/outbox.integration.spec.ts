/**
 * 실제 MySQL 로 아웃박스 릴레이와 인메모리 버스의 결합을 검증한다.
 *
 * 평소 `pnpm check` 에서는 `TEST_DATABASE_URL` 이 없어 건너뛴다. 돌리려면 (`mise run infra:up` 뒤):
 *
 *   TEST_DATABASE_URL=mysql://root:root@localhost:3306/lh_messaging_test \
 *     mise exec -- pnpm turbo run test --filter=@repo/db-kit
 *
 * URL 의 데이터베이스는 이 테스트가 만들고(`CREATE DATABASE`) 끝나면 지운다(`DROP DATABASE`).
 * 실수로 서비스 DB 를 지우지 않도록 이름이 `_test` 로 끝나야 한다.
 *
 * 재현하는 문제: `REDIS_URL` 이 비어 `InMemoryMessageBus` 를 쓸 때, 릴레이가 발행 중인 트랜잭션 안에서
 * 핸들러가 바로 실행되어 자기 트랜잭션으로 아웃박스에 적으려다 릴레이의 갭 잠금에 막히고, 릴레이는 그 핸들러를
 * 기다려 lock wait timeout 이 나던 것. 테스트에서는 잠금 대기 시간을 5초로 줄여 빨리 드러나게 한다.
 */
import { asc, sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryMessageBus } from '@repo/messaging/in-memory';
import type { MessageBus } from '@repo/messaging/message-bus';

import { createDb, type AnyDb } from './db.js';
import { claimMessage } from './inbox.js';
import { enqueue, outboxEvents, OutboxRelay } from './outbox.js';

const url = process.env['TEST_DATABASE_URL'];
const SKIP_NOTE = 'TEST_DATABASE_URL 이 없어 건너뜀. 실행 방법은 이 파일 머리 주석.';
const TEST_TIMEOUT_MS = 20_000;

const parseUrl = (raw: string) => {
  const parsed = new URL(raw);
  const database = parsed.pathname.replace(/^\//, '') || 'lh_messaging_test';
  if (!database.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL 의 데이터베이스 이름은 _test 로 끝나야 한다: ${database}`);
  }
  parsed.pathname = '/';
  return { server: parsed.toString(), database };
};

const SCHEMA = [
  sql`CREATE TABLE outbox_events (
    id varchar(36) NOT NULL,
    topic varchar(100) NOT NULL,
    \`key\` varchar(200) NOT NULL,
    payload json NOT NULL,
    created_at datetime(3) NOT NULL,
    published_at datetime(3),
    CONSTRAINT outbox_events_id PRIMARY KEY(id)
  )`,
  sql`CREATE INDEX outbox_unpublished_idx ON outbox_events (published_at, id)`,
  sql`CREATE TABLE processed_messages (
    id varchar(36) NOT NULL,
    consumer_group varchar(100) NOT NULL,
    message_id varchar(36) NOT NULL,
    processed_at datetime(3) NOT NULL,
    CONSTRAINT processed_messages_id PRIMARY KEY(id),
    CONSTRAINT processed_messages_group_message_uq UNIQUE(consumer_group, message_id)
  )`,
];

/** 잠금 대기 기본값(50초)을 기다리지 않도록 이 테스트가 여는 트랜잭션마다 줄인다. 연결에 남지만 테스트 전용 풀이다. */
const shortLockWait = (tx: AnyDb) => tx.execute(sql`SET SESSION innodb_lock_wait_timeout = 5`);

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const until = async (predicate: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('조건이 제때 충족되지 않았다');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('OutboxRelay + InMemoryMessageBus (실제 MySQL)', () => {
  let handle: ReturnType<typeof createDb> | undefined;
  let database = '';
  let server = '';

  const db = () => {
    if (!handle) throw new Error('DB 가 준비되지 않았다');
    return handle.db;
  };

  beforeAll(async () => {
    if (!url) return;
    ({ server, database } = parseUrl(url));
    const admin = await mysql.createConnection({ uri: server });
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`CREATE DATABASE \`${database}\``);
    await admin.end();

    handle = createDb(`${server}${database}`, {});
    for (const statement of SCHEMA) await handle.db.execute(statement);
  });

  afterAll(async () => {
    if (!handle) return;
    await handle.pool.end();
    const admin = await mysql.createConnection({ uri: server });
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  });

  const resetTables = async () => {
    await db().execute(sql`DELETE FROM outbox_events`);
    await db().execute(sql`DELETE FROM processed_messages`);
  };

  const rows = () => db().select().from(outboxEvents).orderBy(asc(outboxEvents.id));

  it(
    '핸들러가 자기 트랜잭션으로 아웃박스에 적어도 릴레이와 서로 기다리지 않는다',
    async (ctx) => {
      ctx.skip(!url, SKIP_NOTE);
      await resetTables();

      const bus = new InMemoryMessageBus({ retryAfterMs: 50 });
      const handled: string[] = [];
      // oms-api 의 소비자처럼: 멱등 기록 + 업무 변경 + 다음 이벤트 적기를 한 트랜잭션으로.
      await bus.subscribe('scm.unit-events', 'oms-api', async (message) => {
        await db().transaction(async (tx) => {
          await shortLockWait(tx);
          if (!(await claimMessage(tx, 'oms-api', message.id))) return;
          await enqueue(tx, 'oms.order-events', message.key, { reactedTo: message.value });
          handled.push(message.id);
        });
      });
      await db().transaction(async (tx) => {
        await shortLockWait(tx);
        await enqueue(tx, 'scm.unit-events', 'SN-1', { type: 'scm.unit.event-recorded' });
      });

      const relay = new OutboxRelay(db(), bus);
      await expect(relay.flush()).resolves.toBe(1);
      await bus.idle();

      expect(handled).toHaveLength(1);
      const after = await rows();
      expect(after.map((r) => [r.topic, r.publishedAt !== null])).toEqual([
        ['scm.unit-events', true],
        ['oms.order-events', false],
      ]);

      // 핸들러가 적은 이벤트도 다음 flush 에 나간다.
      await expect(relay.flush()).resolves.toBe(1);
      await expect(relay.flush()).resolves.toBe(0);
      await bus.close();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '브로커가 느려도 발행 중에 아웃박스에 적는 트랜잭션을 막지 않고, 다른 릴레이는 건너뛴다',
    async (ctx) => {
      ctx.skip(!url, SKIP_NOTE);
      await resetTables();

      const gate = deferred();
      let publishCalls = 0;
      const slowBus: MessageBus = {
        publish: async () => {
          publishCalls += 1;
          await gate.promise;
        },
        subscribe: () => Promise.resolve(),
        close: () => Promise.resolve(),
      };
      await db().transaction(async (tx) => {
        await shortLockWait(tx);
        await enqueue(tx, 'scm.unit-events', 'SN-1', { n: 1 });
      });

      const relay = new OutboxRelay(db(), slowBus);
      const flushing = relay.flush();
      try {
        await until(() => publishCalls === 1);

        // 릴레이가 발행을 기다리는 동안 업무 트랜잭션이 아웃박스에 적을 수 있어야 한다.
        await expect(
          db().transaction(async (tx) => {
            await shortLockWait(tx);
            await enqueue(tx, 'scm.unit-events', 'SN-2', { n: 2 });
          }),
        ).resolves.toBeUndefined();

        // 같은 DB 를 보는 두 번째 릴레이 인스턴스는 첫 릴레이가 끝날 때까지 아무것도 보내지 않는다.
        await expect(new OutboxRelay(db(), slowBus).flush()).resolves.toBe(0);
        expect(publishCalls).toBe(1);
      } finally {
        // 실패해도 릴레이를 풀어 다음 테스트가 잠금에 걸리지 않게 한다.
        gate.resolve();
      }
      await expect(flushing).resolves.toBe(1);
      const after = await rows();
      expect(after.map((r) => [r.key, r.publishedAt !== null])).toEqual([
        ['SN-1', true],
        ['SN-2', false],
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    '중간에 발행이 실패하면 그 앞까지만 표시하고, 다음 flush 가 남은 것을 순서대로 보낸다',
    async (ctx) => {
      ctx.skip(!url, SKIP_NOTE);
      await resetTables();

      const sent: string[] = [];
      let failOn: string | undefined = 'SN-2';
      const flakyBus: MessageBus = {
        publish: (_topic, message) => {
          if (message.key === failOn) return Promise.reject(new Error('broker unavailable'));
          sent.push(message.key);
          return Promise.resolve();
        },
        subscribe: () => Promise.resolve(),
        close: () => Promise.resolve(),
      };
      for (const key of ['SN-1', 'SN-2', 'SN-3']) {
        await db().transaction(async (tx) => {
          await shortLockWait(tx);
          await enqueue(tx, 'scm.unit-events', key, { key });
        });
      }

      const relay = new OutboxRelay(db(), flakyBus);
      await expect(relay.flush()).rejects.toThrow('broker unavailable');
      expect((await rows()).map((r) => [r.key, r.publishedAt !== null])).toEqual([
        ['SN-1', true],
        ['SN-2', false],
        ['SN-3', false],
      ]);

      failOn = undefined;
      await expect(relay.flush()).resolves.toBe(2);
      expect(sent).toEqual(['SN-1', 'SN-2', 'SN-3']);
      expect((await rows()).every((r) => r.publishedAt !== null)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});
