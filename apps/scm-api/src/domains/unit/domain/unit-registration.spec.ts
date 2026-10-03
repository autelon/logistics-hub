import { describe, expect, it } from 'vitest';

import type { UnitStatus } from '@repo/contracts/scm';

import { decideRegistration } from './unit-registration.js';

const unit = (status: UnitStatus, registeredAt: Date | null = null) => ({ status, registeredAt });

describe('decideRegistration', () => {
  it('시리얼 추적 제품이고 재고에 있고 미등록이면 등록할 수 있다', () => {
    expect(decideRegistration(unit('IN_STOCK'), 'SERIAL')).toBe('REGISTRABLE');
  });

  it('모르는 시리얼은 UNIT_NOT_FOUND', () => {
    expect(decideRegistration(undefined, 'SERIAL')).toBe('UNIT_NOT_FOUND');
  });

  it('시리얼 추적 제품이 아니면 NOT_SERIAL_TRACKED', () => {
    expect(decideRegistration(unit('IN_STOCK'), 'LOT')).toBe('NOT_SERIAL_TRACKED');
    expect(decideRegistration(unit('IN_STOCK'), 'NONE')).toBe('NOT_SERIAL_TRACKED');
  });

  it('IN_STOCK 이 아니면 NOT_IN_STOCK', () => {
    for (const status of ['UNKNOWN', 'PRODUCED', 'IN_TRANSIT', 'SHIPPED', 'DOA'] as const) {
      expect(decideRegistration(unit(status), 'SERIAL')).toBe('NOT_IN_STOCK');
    }
  });

  it('이미 등록되었으면 ALREADY_REGISTERED', () => {
    expect(decideRegistration(unit('IN_STOCK', new Date()), 'SERIAL')).toBe('ALREADY_REGISTERED');
  });

  it('이미 등록된 개체는 상태가 바뀌었어도 NOT_IN_STOCK 이 아니라 ALREADY_REGISTERED 다', () => {
    expect(decideRegistration(unit('SHIPPED', new Date()), 'SERIAL')).toBe('ALREADY_REGISTERED');
  });

  it('모르는 시리얼 → 추적 방식 → 이미 등록 → 재고 순으로 따진다', () => {
    expect(decideRegistration(unit('SHIPPED', new Date()), 'LOT')).toBe('NOT_SERIAL_TRACKED');
  });
});
