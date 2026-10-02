/**
 * 다른 서비스로 내보낼 이벤트를 아웃박스 테이블에 적는 포트. application 서비스가 주입받아 쓴다.
 *
 * 현재 실행 컨텍스트의 연결로 쓰기 때문에, usecase 가 연 `TransactionRunner.run` 안에서 불리면
 * 업무 데이터와 같은 트랜잭션으로 커밋·롤백된다. 실제 발행은 커밋 뒤 `OutboxRelay` 가 한다.
 */
export interface EventOutbox {
  /** `event` 는 `@repo/contracts` 의 `makeEvent(...)` 로 만든 값. `key` 가 같은 이벤트끼리 순서가 유지된다. */
  enqueue(topic: string, key: string, event: unknown): Promise<void>;
}
export const EventOutbox = Symbol('EventOutbox');
