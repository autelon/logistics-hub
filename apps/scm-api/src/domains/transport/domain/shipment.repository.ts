import type {
  NewShipment,
  NewShipmentCorrection,
  NewShipmentLink,
  Shipment,
  ShipmentDetail,
  ShipmentFilter,
} from './shipment.js';

export interface ShipmentRepository {
  /** 이 키로 이미 기록된 선적. 키가 없는 제출은 늘 새 선적이라 넘기지 않는다. */
  findByIdempotencyKeys(keys: readonly string[]): Promise<Shipment[]>;

  /**
   * 선적과 줄, 시리얼을 저장한다 (id 와, `shipmentNo` 가 null 이면 `UNLINKED-…` 를 발급). 넘긴 순서대로 돌려준다.
   * 같은 idempotencyKey 가 동시에 커밋되어 있으면 `ShipmentConflict` 를 던진다.
   */
  insertAll(drafts: readonly NewShipment[]): Promise<Shipment[]>;

  /**
   * 발주별로 연결된 선적 수. 다음 차수 번호의 근거다. 선적이 없는 발주는 들어 있지 않다.
   * **무효화한 선적도 센다.** 차수 번호를 다시 쓰지 않는다(`shipment_no` unique).
   */
  countByPurchaseOrders(purchaseOrderIds: readonly string[]): Promise<Map<string, number>>;
  /** 발주 줄별 연결된 선적 수량 누계. 선적이 없는 줄은 들어 있지 않다. 무효화한 선적의 줄은 뺀다. */
  shippedQuantities(purchaseOrderLineIds: readonly string[]): Promise<Map<string, number>>;
  /** 이미 어떤 선적에 들어 있는 시리얼. 무효화한 선적의 시리얼은 뺀다(다시 제출한 선적이 `DUPLICATE_SERIAL` 이 되지 않도록). */
  findKnownSerials(serialNumbers: readonly string[]): Promise<Set<string>>;

  /** 현재 번호로 찾고, 없으면 연결 전 번호(`UNLINKED-…`)로도 찾는다. */
  findByShipmentNo(shipmentNo: string): Promise<ShipmentDetail | undefined>;
  /** `findByShipmentNo` 에 선적 행 잠금을 더한다. 같은 선적을 연결하는 명령을 줄 세운다. */
  findByShipmentNoForUpdate(shipmentNo: string): Promise<ShipmentDetail | undefined>;
  /** 최근 순(도착 순서의 역순). */
  listRecent(filter: ShipmentFilter, limit: number): Promise<ShipmentDetail[]>;
  /** 선적의 시리얼 전부(줄 사이의 중복은 한 번만). 무효화한 선적이어도 준다. */
  serialNumbersOf(shipmentId: string): Promise<string[]>;

  /**
   * 연결 기록을 추가하고, 선적의 해석 값(발주, 번호, 줄의 발주 줄)을 채운다. 보고된 값은 건드리지 않는다.
   * 같은 선적을 두 번 연결하면 실패한다(`shipment_links.shipment_id` unique).
   */
  link(link: NewShipmentLink): Promise<void>;

  /**
   * 무효화 기록을 추가한다. 보고된 값은 건드리지 않는다.
   * 같은 선적을 두 번 무효화하면 실패한다(`shipment_corrections.shipment_id` unique).
   */
  addCorrection(correction: NewShipmentCorrection): Promise<void>;
}
export const ShipmentRepository = Symbol('ShipmentRepository');
