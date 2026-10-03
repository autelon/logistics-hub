import { describe, expect, it } from 'vitest';

import { currentAnomalies, roundShipmentNo, unlinkedShipmentNo } from './shipment-numbering.js';
import type { ShipmentAnomaly } from './shipment.js';

const anomaly = (code: ShipmentAnomaly['code'], lineNo: number | null = null): ShipmentAnomaly => ({
  code,
  message: code,
  lineNo,
});

describe('roundShipmentNo', () => {
  it('<발주 번호>-R<n>', () => {
    expect(roundShipmentNo('PO-2026-000007', 3)).toBe('PO-2026-000007-R3');
  });
});

describe('unlinkedShipmentNo', () => {
  it('UUIDv7 의 시각이 아니라 뒤쪽 무작위 12자리를 쓴다', () => {
    const a = unlinkedShipmentNo('01999999-9999-7abc-8def-0123456789ab');
    const b = unlinkedShipmentNo('01999999-9999-7abc-8def-ba9876543210');
    expect(a).toBe('UNLINKED-0123456789ab');
    expect(a).not.toBe(b);
  });
});

describe('currentAnomalies', () => {
  const recorded = [
    anomaly('PO_UNLINKED'),
    anomaly('PO_LINE_UNMATCHED', 1),
    anomaly('SERIAL_COUNT_MISMATCH', 1),
    anomaly('DUPLICATE_SERIAL', 2),
  ];

  it('연결 전에는 받을 때의 이상 그대로', () => {
    expect(currentAnomalies(recorded, null)).toEqual(recorded);
  });

  it('연결하면 발주 연결에 관한 이상은 해소되고 연결 시점의 이상이 더해진다', () => {
    const link = { anomalies: [anomaly('OVER_SHIPPED', 1)] };
    expect(currentAnomalies(recorded, link).map((a) => a.code)).toEqual([
      'SERIAL_COUNT_MISMATCH',
      'DUPLICATE_SERIAL',
      'OVER_SHIPPED',
    ]);
  });
});
