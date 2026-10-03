import { describe, expect, it } from 'vitest';

import { closeLineRefusal, lineProgress } from './purchase-order-completion.js';

const line = (overrides: Partial<Parameters<typeof lineProgress>[0]> = {}) => ({
  orderedQty: 100,
  overTolerancePct: null,
  underTolerancePct: null,
  closed: false,
  cancelled: false,
  ...overrides,
});

describe('lineProgress', () => {
  it('아무것도 안 왔으면 OPEN 이고 열린 수량은 주문 수량이다', () => {
    expect(lineProgress(line(), 0)).toEqual({ receivedQty: 0, openQty: 100, completion: 'OPEN' });
  });

  it('덜 왔으면 OPEN 이고 열린 수량은 남은 수량이다', () => {
    expect(lineProgress(line(), 60)).toEqual({ receivedQty: 60, openQty: 40, completion: 'OPEN' });
  });

  it('허용률이 없으면 주문 수량과 정확히 같을 때만 COMPLETE 다', () => {
    expect(lineProgress(line(), 99).completion).toBe('OPEN');
    expect(lineProgress(line(), 100)).toEqual({
      receivedQty: 100,
      openQty: 0,
      completion: 'COMPLETE',
    });
    expect(lineProgress(line(), 101).completion).toBe('OVER');
  });

  it('미납 허용 안이면 COMPLETE 다 (경계 포함)', () => {
    const tolerant = line({ underTolerancePct: 5 });
    expect(lineProgress(tolerant, 94).completion).toBe('OPEN');
    expect(lineProgress(tolerant, 95)).toEqual({
      receivedQty: 95,
      openQty: 0,
      completion: 'COMPLETE',
    });
  });

  it('과납 허용 안이면 COMPLETE, 넘으면 OVER 다 (경계 포함)', () => {
    const tolerant = line({ overTolerancePct: 10 });
    expect(lineProgress(tolerant, 110).completion).toBe('COMPLETE');
    expect(lineProgress(tolerant, 111)).toEqual({
      receivedQty: 111,
      openQty: 0,
      completion: 'OVER',
    });
  });

  it('소수 허용률도 정수 계산으로 경계가 정확하다', () => {
    // 2.5% → 200 개의 과납 한도는 205 개.
    const tolerant = line({ orderedQty: 200, overTolerancePct: 2.5, underTolerancePct: 0.1 });
    expect(lineProgress(tolerant, 205).completion).toBe('COMPLETE');
    expect(lineProgress(tolerant, 206).completion).toBe('OVER');
    // 0.1% → 200 개의 미납 한도는 199.8 개, 즉 200 개여야 한다.
    expect(lineProgress(tolerant, 199).completion).toBe('OPEN');
  });

  it('덜 왔는데 닫았으면 CLOSED_SHORT 이고 더 기다리지 않는다', () => {
    expect(lineProgress(line({ closed: true }), 60)).toEqual({
      receivedQty: 60,
      openQty: 0,
      completion: 'CLOSED_SHORT',
    });
  });

  it('닫은 줄이라도 허용 안으로 채워졌으면 COMPLETE, 넘쳤으면 OVER 다', () => {
    expect(lineProgress(line({ closed: true }), 100).completion).toBe('COMPLETE');
    expect(lineProgress(line({ closed: true }), 150).completion).toBe('OVER');
  });

  it('취소한 줄은 받은 수량과 관계없이 CANCELLED 다', () => {
    expect(lineProgress(line({ cancelled: true }), 0)).toEqual({
      receivedQty: 0,
      openQty: 0,
      completion: 'CANCELLED',
    });
  });

  it('입고가 몇 번으로 나뉘든 누계만 본다', () => {
    const tolerant = line({ overTolerancePct: 5 });
    const received = [30, 40, 35].reduce((sum, qty) => sum + qty, 0);
    expect(lineProgress(tolerant, received).completion).toBe('COMPLETE');
  });
});

describe('closeLineRefusal', () => {
  it('OPEN 인 줄은 닫을 수 있다', () => {
    expect(closeLineRefusal(line(), 60)).toBeUndefined();
    expect(closeLineRefusal(line(), 0)).toBeUndefined();
  });

  it('이미 닫은 줄은 거절한다', () => {
    expect(closeLineRefusal(line({ closed: true }), 60)).toBe('PO_LINE_ALREADY_CLOSED');
  });

  it('취소한 줄은 거절한다', () => {
    expect(closeLineRefusal(line({ cancelled: true }), 0)).toBe('PO_LINE_CANCELLED');
  });

  it('다 받았거나 넘치게 받은 줄은 거절한다 (닫기는 미달 납품용)', () => {
    expect(closeLineRefusal(line(), 100)).toBe('PO_LINE_ALREADY_COMPLETE');
    expect(closeLineRefusal(line(), 120)).toBe('PO_LINE_ALREADY_COMPLETE');
  });
});
