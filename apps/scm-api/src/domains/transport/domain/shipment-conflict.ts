/**
 * 같은 idempotencyKey 의 제출과 동시에 처리되다 져서 저장에 실패했다.
 * 업무 규칙 위반이 아니고, 진 트랜잭션은 롤백되어 있다. 처음부터 다시 하면 이긴 쪽의 선적이 보여
 * 중복(`duplicate: true`)으로 알아본다.
 */
export class ShipmentConflict extends Error {
  constructor(cause: unknown) {
    super('Concurrent insert lost the race on shipment idempotency key', { cause });
    this.name = 'ShipmentConflict';
  }
}
