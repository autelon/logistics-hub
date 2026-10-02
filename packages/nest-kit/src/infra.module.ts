import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { createDb, type AnyDb } from '@repo/db-kit/db';
import { OutboxRelay } from '@repo/db-kit/outbox';
import { InMemoryMessageBus } from '@repo/messaging/in-memory';
import type { MessageBus } from '@repo/messaging/message-bus';
import { RedisStreamsMessageBus } from '@repo/messaging/redis-streams';

export const DB = Symbol('DB');
export const MESSAGE_BUS = Symbol('MESSAGE_BUS');
const DB_HANDLE = Symbol('DB_HANDLE');

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

/** DB 연결, 메시지 버스, 아웃박스 릴레이를 한 번에 제공한다. 서비스마다 AppModule 에서 한 번 등록. */
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
        InfraLifecycle,
      ],
      exports: [DB, MESSAGE_BUS, OutboxRelay],
    };
  }
}
