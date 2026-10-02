export interface Message {
  /** 브로커가 부여한 식별자(스트림 엔트리 id, Kafka offset 등). */
  id: string;
  topic: string;
  /** 같은 key 의 메시지는 순서가 보장되어야 한다(Kafka 의 partition key). */
  key: string;
  value: unknown;
}

export type MessageHandler = (message: Message) => Promise<void>;

/**
 * 서비스가 의존하는 유일한 메시징 인터페이스.
 *
 * 의미는 Kafka 에 맞췄다: 토픽에 쌓이고, 컨슈머 그룹마다 한 번씩 전달되며,
 * 핸들러가 성공해야 ack 된다(at-least-once). 따라서 핸들러는 멱등이어야 한다.
 * 브로커를 바꿀 때는 이 인터페이스의 구현체만 새로 만들면 된다.
 */
export interface MessageBus {
  publish(topic: string, message: { key: string; value: unknown }): Promise<void>;
  subscribe(topic: string, group: string, handler: MessageHandler): Promise<void>;
  close(): Promise<void>;
}
