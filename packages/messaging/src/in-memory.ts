import type { Message, MessageBus, MessageHandler } from './message-bus.js';

export interface InMemoryOptions {
  /** 핸들러가 실패한 메시지를 다시 시도하기까지 기다리는 시간. */
  retryAfterMs?: number;
  onError?: (error: unknown, context: string) => void;
}

/** 토픽 + 컨슈머 그룹 하나의 구독. 큐는 도착 순서이고 한 번에 하나만 처리한다. */
interface Subscription {
  readonly topic: string;
  readonly group: string;
  readonly handler: MessageHandler;
  readonly queue: Message[];
  /** 전달 루프가 돌고 있거나 재시도를 기다리는 중. */
  busy: boolean;
  retryTimer: NodeJS.Timeout | undefined;
}

/**
 * 테스트와 브로커 없는 단독 실행용. 프로세스 밖으로는 전달되지 않는다.
 *
 * Redis 구현과 같은 의미를 지키려고 `publish` 는 큐에 넣고 바로 돌아오고, 핸들러는 다음 이벤트 루프 턴에
 * 그룹마다 순서대로(한 번에 하나) 실행된다. 발행자의 호출 스택이나 트랜잭션 안에서 핸들러가 돌지 않는다.
 * 핸들러가 던지면 발행자에게 전파하지 않고 `onError` 로 기록한 뒤 `retryAfterMs` 뒤에 같은 메시지를 다시 시도한다
 * (Redis 의 "ack 안 함 → 재전달"과 같다). 큐는 메모리에만 있으므로 프로세스가 죽으면 전달 안 된 메시지는 사라진다.
 */
export class InMemoryMessageBus implements MessageBus {
  private readonly subscriptions = new Map<string, Map<string, Subscription>>();
  private readonly idleWaiters: (() => void)[] = [];
  private seq = 0;
  private closed = false;

  private readonly retryAfterMs: number;
  private readonly onError: (error: unknown, context: string) => void;

  constructor(options: InMemoryOptions = {}) {
    this.retryAfterMs = options.retryAfterMs ?? 1000;
    this.onError =
      options.onError ?? ((error, context) => console.error(`[messaging] ${context}`, error));
  }

  publish(topic: string, message: { key: string; value: unknown }): Promise<void> {
    const id = String(++this.seq);
    for (const subscription of this.subscriptions.get(topic)?.values() ?? []) {
      subscription.queue.push({ id, topic, key: message.key, value: message.value });
      if (!subscription.busy) {
        subscription.busy = true;
        setImmediate(() => void this.drain(subscription));
      }
    }
    return Promise.resolve();
  }

  subscribe(topic: string, group: string, handler: MessageHandler): Promise<void> {
    const groups = this.subscriptions.get(topic) ?? new Map<string, Subscription>();
    groups.set(group, { topic, group, handler, queue: [], busy: false, retryTimer: undefined });
    this.subscriptions.set(topic, groups);
    return Promise.resolve();
  }

  /** 큐에 남은 메시지와 실행 중인 핸들러가 모두 끝나면 resolve 된다. 테스트에서 전달 완료를 기다릴 때 쓴다. */
  idle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  close(): Promise<void> {
    this.closed = true;
    for (const groups of this.subscriptions.values()) {
      for (const subscription of groups.values()) {
        clearTimeout(subscription.retryTimer);
        subscription.queue.length = 0;
        subscription.busy = false;
      }
    }
    this.subscriptions.clear();
    this.notifyIdle();
    return Promise.resolve();
  }

  private async drain(subscription: Subscription) {
    while (!this.closed) {
      const message = subscription.queue[0];
      if (message === undefined) break;
      try {
        await subscription.handler(message);
        subscription.queue.shift();
      } catch (error) {
        this.onError(
          error,
          `handler ${subscription.topic}/${subscription.group} message ${message.id}`,
        );
        // 메시지를 큐 머리에 둔 채로 쉬었다가 다시 시도한다. 그동안 뒤 메시지는 기다린다(그룹 안 순서 보장).
        subscription.retryTimer = setTimeout(() => {
          subscription.retryTimer = undefined;
          void this.drain(subscription);
        }, this.retryAfterMs);
        return;
      }
    }
    subscription.busy = false;
    this.notifyIdle();
  }

  private isIdle() {
    for (const groups of this.subscriptions.values()) {
      for (const subscription of groups.values()) if (subscription.busy) return false;
    }
    return true;
  }

  private notifyIdle() {
    if (!this.isIdle()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}
