/** 동시 요청에게 져서 저장에 실패한 이유. */
export type UnitConflictReason =
  /** 같은 시리얼의 첫 보고가 동시에 와서, 다른 요청이 먼저 시리얼을 만들었다. */
  | 'serialNumber'
  /** 같은 idempotencyKey 의 보고가 동시에 와서, 다른 요청이 먼저 사실을 커밋했다. */
  | 'idempotencyKey'
  /**
   * 없는 시리얼을 `FOR UPDATE` 로 읽은 요청들이 같은 틈(gap)에 잠금을 잡고 서로의 INSERT 를 기다려
   * InnoDB 가 한쪽을 희생시켰다. 같은 시리얼의 첫 보고가 동시에 올 때 생긴다 (scm-api 플레이북 "교착").
   */
  | 'deadlock';

/**
 * 같은 시리얼·같은 idempotencyKey 의 보고와 동시에 처리되다 져서 저장에 실패했다.
 * 업무 규칙 위반이 아니고, 진 트랜잭션은 롤백되어 있다. 처음부터 다시 하면
 * 이미 있는 시리얼은 잠그고, 이미 있는 idempotencyKey 는 중복으로 알아본다.
 */
export class UnitConflict extends Error {
  readonly reason: UnitConflictReason;

  constructor(reason: UnitConflictReason, cause: unknown) {
    super(`Concurrent insert lost the race on unit (${reason})`, { cause });
    this.name = 'UnitConflict';
    this.reason = reason;
  }
}
