import type { MessageBus, MessageHandler } from './message-bus.js';

/** 테스트와 브로커 없는 단독 실행용. 프로세스 밖으로는 전달되지 않는다. */
export class InMemoryMessageBus implements MessageBus {
  private readonly groups = new Map<string, Map<string, MessageHandler>>();
  private seq = 0;

  async publish(topic: string, message: { key: string; value: unknown }): Promise<void> {
    const id = String(++this.seq);
    for (const handler of this.groups.get(topic)?.values() ?? []) {
      await handler({ id, topic, key: message.key, value: message.value });
    }
  }

  subscribe(topic: string, group: string, handler: MessageHandler): Promise<void> {
    const handlers = this.groups.get(topic) ?? new Map<string, MessageHandler>();
    handlers.set(group, handler);
    this.groups.set(topic, handlers);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.groups.clear();
    return Promise.resolve();
  }
}
