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

/**
 * 무효화하려고 읽은 뒤 잠그는 사이에 선적이 다른 발주에 연결되었다(운영자의 연결 명령이 먼저 커밋됨).
 * 발주 행을 먼저 잠근 뒤에 선적을 잠그는 순서를 지키려면 새로 읽은 발주로 처음부터 다시 해야 한다.
 */
export class ShipmentOrderChanged extends Error {
  constructor(shipmentNo: string) {
    super(`Shipment ${shipmentNo} was linked to a purchase order while being voided`);
    this.name = 'ShipmentOrderChanged';
  }
}
