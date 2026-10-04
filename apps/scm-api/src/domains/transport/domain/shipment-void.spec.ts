import { describe, expect, it } from 'vitest';

import { decideVoid, dispatchSourceRefs, isVoided } from './shipment-void.js';
import type { ShipmentCorrection } from './shipment.js';

const correction: ShipmentCorrection = {
  id: 'X1',
  shipmentId: 'S1',
  reason: '시리얼 목록이 틀림',
  actor: 'op-1',
  recordedAt: new Date('2026-10-05T00:00:00.000Z'),
};

describe('decideVoid', () => {
  it('없는 선적은 NOT_FOUND', () => {
    expect(decideVoid(undefined)).toBe('NOT_FOUND');
  });

  it('무효화 기록이 없으면 무효화할 수 있다', () => {
    expect(decideVoid({ correction: null })).toBe('VOIDABLE');
  });

  it('이미 무효화된 선적은 다시 무효화할 수 없다', () => {
    expect(decideVoid({ correction })).toBe('ALREADY_VOIDED');
  });
});

describe('isVoided', () => {
  it('무효화 기록이 있으면 무효 선적이다', () => {
    expect(isVoided({ correction })).toBe(true);
    expect(isVoided({ correction: null })).toBe(false);
  });
});

describe('dispatchSourceRefs', () => {
  const detail = (shipmentNo: string, previous: string | null) => ({
    shipment: { shipmentNo },
    link: previous === null ? null : { previousShipmentNo: previous },
  });

  it('미연결 선적은 지금 번호 하나다', () => {
    expect(dispatchSourceRefs(detail('UNLINKED-abc', null))).toEqual(['UNLINKED-abc']);
  });

  it('연결된 선적은 지금 차수 번호와 연결 전 번호 둘 다다 (사실의 출처 참조에 기록 당시 번호가 남아 있다)', () => {
    expect(dispatchSourceRefs(detail('PO-1-R3', 'UNLINKED-abc'))).toEqual([
      'PO-1-R3',
      'UNLINKED-abc',
    ]);
  });

  it('처음부터 발주에 연결된 선적은 연결 기록이 없어 차수 번호 하나다', () => {
    expect(dispatchSourceRefs(detail('PO-1-R1', null))).toEqual(['PO-1-R1']);
  });
});
