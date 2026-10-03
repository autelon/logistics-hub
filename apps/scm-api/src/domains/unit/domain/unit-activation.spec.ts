import { describe, expect, it } from 'vitest';

import type { UnitStatus } from '@repo/contracts/scm';

import {
  activationChange,
  correctionDeviceRequestReason,
  shouldBeActive,
} from './unit-activation.js';

const at = new Date('2026-02-01T00:00:00.000Z');
const registered = (status: UnitStatus) => ({ status, registeredAt: at });
const unregistered = (status: UnitStatus) => ({ status, registeredAt: null });

describe('shouldBeActive', () => {
  it('등록되었고 불량·폐기가 아니면 기기에서 활성이어야 한다', () => {
    expect(shouldBeActive(registered('IN_STOCK'))).toBe(true);
    expect(shouldBeActive(registered('SHIPPED'))).toBe(true);
    expect(shouldBeActive(registered('DELIVERED'))).toBe(true);
    expect(shouldBeActive(registered('RETURNED'))).toBe(true);
  });

  it('등록되지 않았으면 비활성이다', () => {
    expect(shouldBeActive(unregistered('IN_STOCK'))).toBe(false);
    expect(shouldBeActive(unregistered('DELIVERED'))).toBe(false);
  });

  it('DOA 와 폐기는 등록되어 있어도 비활성이다', () => {
    expect(shouldBeActive(registered('DOA'))).toBe(false);
    expect(shouldBeActive(registered('SCRAPPED'))).toBe(false);
  });
});

describe('activationChange', () => {
  it('활성 → 비활성이면 DEACTIVATE 요청이 필요하다 (DOA 확정, 폐기)', () => {
    expect(activationChange(registered('DELIVERED'), registered('DOA'))).toBe('DEACTIVATE');
    expect(activationChange(registered('IN_STOCK'), registered('SCRAPPED'))).toBe('DEACTIVATE');
  });

  it('등록 사실이 무효화되어 활성 → 비활성이 되어도 DEACTIVATE', () => {
    expect(activationChange(registered('IN_STOCK'), unregistered('IN_STOCK'))).toBe('DEACTIVATE');
  });

  it('비활성 → 활성이면 REGISTER 요청이 필요하다 (DOA 사실 정정, 등록 사실 추가)', () => {
    expect(activationChange(registered('DOA'), registered('DELIVERED'))).toBe('REGISTER');
    expect(activationChange(unregistered('IN_STOCK'), registered('IN_STOCK'))).toBe('REGISTER');
  });

  it('활성 여부가 그대로면 요청이 필요 없다', () => {
    expect(activationChange(registered('IN_STOCK'), registered('SHIPPED'))).toBeNull();
    expect(activationChange(unregistered('IN_STOCK'), unregistered('SHIPPED'))).toBeNull();
    expect(activationChange(registered('DOA'), registered('SCRAPPED'))).toBeNull();
    expect(activationChange(registered('DOA'), unregistered('DOA'))).toBeNull();
  });
});

describe('correctionDeviceRequestReason', () => {
  it('등록 사실을 무효화해서 비활성화하면 REGISTRATION_VOIDED', () => {
    expect(correctionDeviceRequestReason('DEACTIVATE', 'REGISTERED', undefined)).toBe(
      'REGISTRATION_VOIDED',
    );
  });

  it('대체 사실이 비활성화를 일으키면 대체 사실의 종류', () => {
    expect(correctionDeviceRequestReason('DEACTIVATE', 'DELIVERED', 'DOA_CONFIRMED')).toBe(
      'DOA_CONFIRMED',
    );
  });

  it('대체 사실 없이 무효화한 사실이 원인이면 그 사실의 종류', () => {
    expect(correctionDeviceRequestReason('DEACTIVATE', 'SCRAPPED', undefined)).toBe('SCRAPPED');
  });

  it('무효화로 다시 활성이 되면 <무효화한 사실>_VOIDED', () => {
    expect(correctionDeviceRequestReason('REGISTER', 'DOA_CONFIRMED', undefined)).toBe(
      'DOA_CONFIRMED_VOIDED',
    );
  });
});
