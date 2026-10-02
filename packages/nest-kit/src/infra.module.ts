import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { createDb, type AnyDb } from '@repo/db-kit/db';
import { claimMessage } from '@repo/db-kit/inbox';
import { enqueue, OutboxRelay } from '@repo/db-kit/outbox';
import { AmbientTransaction } from '@repo/db-kit/transaction';
import { InMemoryMessageBus } from '@repo/messaging/in-memory';
import type { MessageBus } from '@repo/messaging/message-bus';
import { RedisStreamsMessageBus } from '@repo/messaging/redis-streams';

import { ApiErrorFilter } from './api-error.filter.js';
import { CurrentDb } from './current-db.js';
import { EventOutbox } from './event-outbox.js';
import { MessageInbox } from './message-inbox.js';
import { TransactionRunner } from './transaction-runner.js';

export const DB = Symbol('DB');
export const MESSAGE_BUS = Symbol('MESSAGE_BUS');
const DB_HANDLE = Symbol('DB_HANDLE');
const AMBIENT_TRANSACTION = Symbol('AMBIENT_TRANSACTION');

export interface InfraOptions {
  databaseUrl: string;
  schema: Record<string, unknown>;
  /** 없으면 프로세스 내부 버스를 쓴다(다른 서비스로는 전달되지 않음). */
  redisUrl?: string | undefined;
}

@Injectable()
class InfraLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(DB_HANDLE) private readonly handle: ReturnType<typeof createDb>,
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly relay: OutboxRelay,
  ) {}

  onApplicationBootstrap() {
    this.relay.start();
  }

  async onApplicationShutdown() {
    this.relay.stop();
    await this.bus.close();
    await this.handle.pool.end();
  }
}

/**
 * DB 연결, 트랜잭션(`TransactionRunner`·`CurrentDb`), 아웃박스(`EventOutbox`), 인박스(`MessageInbox`),
 * 메시지 버스, 아웃박스 릴레이, 에러 응답 형식을 한 번에 제공한다. 서비스마다 AppModule 에서 한 번 등록.
 *
 * `DB` 는 루트 연결이라 `TransactionRunner.run` 에 참여하지 않는다. 새 구조의 repository 는 `CurrentDb` 를 쓴다.
 */
@Global()
@Module({})
export class InfraModule {
  static forRoot(options: InfraOptions): DynamicModule {
    return {
      module: InfraModule,
      providers: [
        { provide: DB_HANDLE, useFactory: () => createDb(options.databaseUrl, options.schema) },
        {
          provide: DB,
          inject: [DB_HANDLE],
          useFactory: (handle: ReturnType<typeof createDb>) => handle.db,
        },
        {
          provide: MESSAGE_BUS,
          useFactory: (): MessageBus =>
            options.redisUrl
              ? new RedisStreamsMessageBus(options.redisUrl)
              : new InMemoryMessageBus(),
        },
        {
          provide: OutboxRelay,
          inject: [DB, MESSAGE_BUS],
          useFactory: (db: AnyDb, bus: MessageBus) => new OutboxRelay(db, bus),
        },
        {
          provide: AMBIENT_TRANSACTION,
          inject: [DB],
          useFactory: (db: AnyDb) =>
            new AmbientTransaction<AnyDb>(db, (work) => db.transaction(work)),
        },
        {
          provide: TransactionRunner,
          inject: [AMBIENT_TRANSACTION],
          useFactory: (ambient: AmbientTransaction<AnyDb>): TransactionRunner => ({
            run: (work) => ambient.run(work),
          }),
        },
        {
          provide: CurrentDb,
          inject: [AMBIENT_TRANSACTION],
          useFactory: (ambient: AmbientTransaction<AnyDb>): CurrentDb<Record<string, unknown>> => ({
            get: () => ambient.current(),
          }),
        },
        {
          provide: EventOutbox,
          inject: [AMBIENT_TRANSACTION],
          useFactory: (ambient: AmbientTransaction<AnyDb>): EventOutbox => ({
            enqueue: (topic, key, event) => enqueue(ambient.current(), topic, key, event),
          }),
        },
        {
          provide: MessageInbox,
          inject: [AMBIENT_TRANSACTION],
          useFactory: (ambient: AmbientTransaction<AnyDb>): MessageInbox => ({
            claim: async (consumerGroup, messageId) => {
              if (!ambient.isActive()) {
                throw new Error('MessageInbox.claim 은 TransactionRunner.run 안에서 불러야 한다.');
              }
              return claimMessage(ambient.current(), consumerGroup, messageId);
            },
          }),
        },
        InfraLifecycle,
        { provide: APP_FILTER, useClass: ApiErrorFilter },
      ],
      exports: [
        DB,
        MESSAGE_BUS,
        OutboxRelay,
        TransactionRunner,
        CurrentDb,
        EventOutbox,
        MessageInbox,
      ],
    };
  }
}
