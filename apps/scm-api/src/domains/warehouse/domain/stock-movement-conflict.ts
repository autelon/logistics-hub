/**
 * 같은 idempotencyKey 의 이동이 동시에 들어와, 다른 요청이 먼저 커밋해서 저장에 실패했다.
 * 업무 규칙 위반이 아니다. 지고 나면 먼저 커밋된 행이 보이므로 요청을 처음부터 다시 하면
 * 이미 기록된 키는 중복으로 알아본다.
 */
export class StockMovementConflict extends Error {
  constructor(cause: unknown) {
    super('Concurrent insert lost the race on stock movement idempotencyKey', { cause });
    this.name = 'StockMovementConflict';
  }
}
