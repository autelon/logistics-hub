import { hostname } from 'node:os';
import { Redis } from 'ioredis';

import type { MessageBus, MessageHandler } from './message-bus.js';

export interface RedisStreamsOptions {
  /** 그룹 안에서 이 프로세스를 구분하는 이름. */
  consumerName?: string;
  /** 새 메시지를 기다리는 최대 시간. 종료 지연의 상한이기도 하다. */
  blockMs?: number;
  /** 이 시간 넘게 ack 되지 않은 메시지는 다시 가져와 재시도한다. */
  retryAfterMs?: number;
  onError?: (error: unknown, context: string) => void;
}

type StreamEntry = [id: string, fields: string[]];

/**
 * Redis Streams 구현체. 스트림 = 토픽, 컨슈머 그룹 = 컨슈머 그룹으로 1:1 대응한다.
 * 실패한 메시지는 ack 하지 않고 남겨 두었다가 retryAfterMs 뒤에 다시 처리한다.
 */
export class RedisStreamsMessageBus implements MessageBus {
  private readonly publisher: Redis;
  private readonly subscribers: Redis[] = [];
  private readonly loops: Promise<void>[] = [];
  private closed = false;

  private readonly url: string;
  private readonly consumerName: string;
  private readonly blockMs: number;
  private readonly retryAfterMs: number;
  private readonly onError: (error: unknown, context: string) => void;

  constructor(url: string, options: RedisStreamsOptions = {}) {
    this.url = url;
    this.publisher = new Redis(url);
    this.consumerName = options.consumerName ?? `${hostname()}-${process.pid}`;
    this.blockMs = options.blockMs ?? 2000;
    this.retryAfterMs = options.retryAfterMs ?? 10_000;
    this.onError =
      options.onError ?? ((error, context) => console.error(`[messaging] ${context}`, error));
  }

  async publish(topic: string, message: { key: string; value: unknown }): Promise<void> {
    await this.publisher.xadd(
      topic,
      '*',
      'key',
      message.key,
      'value',
      JSON.stringify(message.value),
    );
  }

  async subscribe(topic: string, group: string, handler: MessageHandler): Promise<void> {
    // 블로킹 읽기는 연결을 점유하므로 구독마다 전용 연결을 쓴다.
    const redis = new Redis(this.url);
    this.subscribers.push(redis);
    try {
      await redis.xgroup('CREATE', topic, group, '0', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
    this.loops.push(this.consume(redis, topic, group, handler));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const redis of this.subscribers) redis.disconnect();
    await Promise.allSettled(this.loops);
    await this.publisher.quit();
  }

  private async consume(redis: Redis, topic: string, group: string, handler: MessageHandler) {
    while (!this.closed) {
      try {
        // 응답 형태는 Redis 프로토콜로 정해져 있지만 ioredis 타입은 unknown 이라 단언한다.
        const stale = (await redis.xautoclaim(
          topic,
          group,
          this.consumerName,
          this.retryAfterMs,
          '0',
          'COUNT',
          10,
        )) as [next: string, entries: StreamEntry[]];
        const fresh = (await redis.xreadgroup(
          'GROUP',
          group,
          this.consumerName,
          'COUNT',
          10,
          'BLOCK',
          this.blockMs,
          'STREAMS',
          topic,
          '>',
        )) as [stream: string, entries: StreamEntry[]][] | null;

        for (const [id, fields] of [...stale[1], ...(fresh?.[0]?.[1] ?? [])]) {
          await this.handle(redis, topic, group, id, fields, handler);
        }
      } catch (error) {
        if (this.closed) return;
        this.onError(error, `consume ${topic}/${group}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async handle(
    redis: Redis,
    topic: string,
    group: string,
    id: string,
    fields: string[],
    handler: MessageHandler,
  ) {
    const record = new Map<string, string>();
    for (let i = 0; i < fields.length; i += 2) record.set(fields[i]!, fields[i + 1]!);
    try {
      await handler({
        id,
        topic,
        key: record.get('key') ?? '',
        value: JSON.parse(record.get('value') ?? 'null'),
      });
      await redis.xack(topic, group, id);
    } catch (error) {
      // ack 하지 않는다 → retryAfterMs 뒤 xautoclaim 으로 다시 들어온다.
      this.onError(error, `handler ${topic}/${group} message ${id}`);
    }
  }
}
