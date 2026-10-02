import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import { createDb, type AnyDb } from '@repo/db-kit/db';
import { OutboxRelay } from '@repo/db-kit/outbox';
import { InMemoryMessageBus } from '@repo/messaging/in-memory';
import type { MessageBus } from '@repo/messaging/message-bus';
import { RedisStreamsMessageBus } from '@repo/messaging/redis-streams';

import { ApiErrorFilter } from './api-error.filter.js';
import { databaseConfig, messagingConfig } from './config.js';

export const DB = Symbol('DB');
export const MESSAGE_BUS = Symbol('MESSAGE_BUS');
const DB_HANDLE = Symbol('DB_HANDLE');

/** 접속 정보는 옵션이 아니라 타입 있는 설정(databaseConfig, messagingConfig)에서 주입받는다. */
export interface InfraOptions {
  schema: Record<string, unknown>;
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

/** DB 연결, 메시지 버스, 아웃박스 릴레이, 에러 응답 형식을 한 번에 제공한다. 서비스마다 AppModule 에서 한 번 등록. */
@Global()
@Module({})
export class InfraModule {
  static forRoot(options: InfraOptions): DynamicModule {
    return {
      module: InfraModule,
      providers: [
        {
          provide: DB_HANDLE,
          inject: [databaseConfig.KEY],
          useFactory: (database: ConfigType<typeof databaseConfig>) =>
            createDb(database.url, options.schema),
        },
        {
          provide: DB,
          inject: [DB_HANDLE],
          useFactory: (handle: ReturnType<typeof createDb>) => handle.db,
        },
        {
          provide: MESSAGE_BUS,
          inject: [messagingConfig.KEY],
          useFactory: (messaging: ConfigType<typeof messagingConfig>): MessageBus =>
            messaging.redisUrl
              ? new RedisStreamsMessageBus(messaging.redisUrl)
              : new InMemoryMessageBus(),
        },
        {
          provide: OutboxRelay,
          inject: [DB, MESSAGE_BUS],
          useFactory: (db: AnyDb, bus: MessageBus) => new OutboxRelay(db, bus),
        },
        InfraLifecycle,
        { provide: APP_FILTER, useClass: ApiErrorFilter },
      ],
      exports: [DB, MESSAGE_BUS, OutboxRelay],
    };
  }
}
