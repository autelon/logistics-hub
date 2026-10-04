import type { Shipment, ShipmentDetail, ShipmentLink } from './shipment.js';

/** 무효화한 선적인가. */
export const isVoided = ({ correction }: Pick<ShipmentDetail, 'correction'>): boolean =>
  correction !== null;

/**
 * 선적을 무효화할 수 있는지(그리고 연결·제품 등록 같은 후속 명령을 받을 수 있는지) 판정한다.
 * 우리가 내리는 명령이라 전제가 맞지 않으면 거절한다.
 * - `NOT_FOUND`: 모르는 선적 (`SHIPMENT_NOT_FOUND`).
 * - `ALREADY_VOIDED`: 이미 무효화된 선적 (`SHIPMENT_ALREADY_VOIDED`). 무효화는 한 번뿐이고, 무효 선적은 연결·제품 등록 명령을 받지 않는다.
 */
export const decideVoid = (
  detail: Pick<ShipmentDetail, 'correction'> | undefined,
): 'VOIDABLE' | 'NOT_FOUND' | 'ALREADY_VOIDED' => {
  if (!detail) return 'NOT_FOUND';
  return isVoided(detail) ? 'ALREADY_VOIDED' : 'VOIDABLE';
};

/**
 * 이 선적이 만든 출발(`DISPATCHED`) 사실의 출처 참조로 쓰였을 수 있는 번호: 지금 선적 번호와 연결 전 번호.
 * 미연결 선적(`UNLINKED-…`)은 발주에 연결되면 차수 번호로 바뀌지만, 사실의 출처 참조에는 기록 당시 번호가 남기 때문이다.
 */
export const dispatchSourceRefs = ({
  shipment,
  link,
}: {
  shipment: Pick<Shipment, 'shipmentNo'>;
  link: Pick<ShipmentLink, 'previousShipmentNo'> | null;
}): string[] => [...new Set([shipment.shipmentNo, ...(link ? [link.previousShipmentNo] : [])])];
