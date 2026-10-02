/**
 * 트랜잭션 경계를 잡는 포트. usecase 만 주입받아 쓴다.
 *
 * `run` 안에서 불린 repository(`CurrentDb`), `EventOutbox`, `MessageInbox` 는 인자를 받지 않아도 같은 트랜잭션에 참여한다.
 * `work` 가 정상 반환하면 커밋, 예외를 던지면 롤백하고 그 예외를 그대로 던진다.
 * 이미 `run` 안에서 다시 부르면 새로 열지 않고 바깥 트랜잭션에 합류한다.
 */
export interface TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}
export const TransactionRunner = Symbol('TransactionRunner');
