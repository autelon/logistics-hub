import type { ShipmentAnomaly, ShipmentLink } from './shipment.js';

/** 발주의 차수 번호: `<발주 번호>-R<n>`. n 은 그 발주에 도착한 순서(1부터). */
export const roundShipmentNo = (poNumber: string, round: number): string => `${poNumber}-R${round}`;

/**
 * 발주에 연결되지 않은 선적의 번호: `UNLINKED-<id 의 뒤 12자리>`.
 * UUIDv7 의 앞쪽은 시각이라 같은 밀리초에 만든 둘이 겹친다. 뒤쪽 무작위 부분을 쓴다.
 */
export const unlinkedShipmentNo = (id: string): string =>
  `UNLINKED-${id.replaceAll('-', '').slice(-12)}`;

/** 연결로 해소되는 이상: 발주에 연결되었고 모든 줄이 발주 줄에 맞춰졌으므로 더는 사실이 아니다. */
const RESOLVED_BY_LINK: ReadonlySet<string> = new Set(['PO_UNLINKED', 'PO_LINE_UNMATCHED']);

/**
 * 지금 유효한 이상. 받을 때 찾은 이상에서 연결로 해소된 것을 빼고, 연결 시점에 찾은 이상을 더한다.
 * 받을 때의 값은 바뀌지 않으므로 같은 입력이면 늘 같은 결과다.
 */
export const currentAnomalies = (
  recorded: readonly ShipmentAnomaly[],
  link: Pick<ShipmentLink, 'anomalies'> | null,
): ShipmentAnomaly[] => {
  if (!link) return [...recorded];
  return [...recorded.filter((anomaly) => !RESOLVED_BY_LINK.has(anomaly.code)), ...link.anomalies];
};
