/**
 * 받은 메시지의 멱등 처리를 위한 포트. consumer 가 부르는 usecase 가 주입받아 쓴다.
 *
 * 반드시 `TransactionRunner.run` 안에서 부른다. 처리 기록과 업무 변경이 같은 트랜잭션이어야
 * "기록은 남았는데 처리는 안 됨"이 생기지 않는다. 트랜잭션 밖에서 부르면 예외를 던진다.
 */
export interface MessageInbox {
  /** 처음 보는 메시지면 기록하고 true, 이미 처리했으면 false. false 면 아무것도 하지 않고 끝낸다. */
  claim(consumerGroup: string, messageId: string): Promise<boolean>;
}
export const MessageInbox = Symbol('MessageInbox');
