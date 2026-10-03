import { describe, expect, it } from 'vitest';

import {
  applyPolicyPatch,
  DEFAULT_LOCATION_POLICY,
  isSamePolicy,
  resolvePolicy,
} from './location-policy.js';

describe('resolvePolicy', () => {
  it('행이 없으면 오늘의 운영 기본값이다', () => {
    expect(resolvePolicy(undefined)).toEqual({
      reportsSerialsOnReceipt: true,
      reportsSerialsOnShipment: true,
      reportsSerialsOnOutbound: true,
      reportsInspectionResult: false,
      decidesDisposition: false,
      requiresHubConfirmation: false,
      unitReceiptTrigger: 'PUTAWAY',
      autoRegisterOnPutaway: false,
    });
  });

  it('기본값 객체를 그대로 돌려주지 않는다 (호출 쪽이 고쳐도 기본값이 변하지 않는다)', () => {
    const resolved = resolvePolicy(undefined);
    expect(resolved).not.toBe(DEFAULT_LOCATION_POLICY);
    resolved.autoRegisterOnPutaway = true;
    expect(DEFAULT_LOCATION_POLICY.autoRegisterOnPutaway).toBe(false);
  });

  it('일부만 있으면 나머지를 기본값으로 채운다 (false 도 값이다)', () => {
    const resolved = resolvePolicy({
      reportsSerialsOnReceipt: false,
      unitReceiptTrigger: 'GOODS_RECEIPT',
    });
    expect(resolved).toEqual({
      ...DEFAULT_LOCATION_POLICY,
      reportsSerialsOnReceipt: false,
      unitReceiptTrigger: 'GOODS_RECEIPT',
    });
  });

  it('저장 행의 부가 컬럼은 결과에 담지 않는다', () => {
    const row = {
      ...DEFAULT_LOCATION_POLICY,
      locationId: 'L1',
      updatedBy: 'kim',
      updatedAt: new Date(),
    };
    expect(Object.keys(resolvePolicy(row)).sort()).toEqual(
      Object.keys(DEFAULT_LOCATION_POLICY).sort(),
    );
  });
});

describe('applyPolicyPatch', () => {
  it('보낸 항목만 바꾸고 나머지는 현재 값을 유지한다', () => {
    const current = resolvePolicy({ decidesDisposition: true });
    expect(applyPolicyPatch(current, { requiresHubConfirmation: true })).toEqual({
      ...DEFAULT_LOCATION_POLICY,
      decidesDisposition: true,
      requiresHubConfirmation: true,
    });
  });

  it('true 를 false 로 되돌릴 수 있다', () => {
    const current = resolvePolicy({ autoRegisterOnPutaway: true });
    expect(applyPolicyPatch(current, { autoRegisterOnPutaway: false }).autoRegisterOnPutaway).toBe(
      false,
    );
  });

  it('값이 undefined 인 항목은 현재 값을 유지한다 (기본값으로 돌아가지 않는다)', () => {
    const current = resolvePolicy({ reportsSerialsOnReceipt: false });
    expect(
      applyPolicyPatch(current, { reportsSerialsOnReceipt: undefined }).reportsSerialsOnReceipt,
    ).toBe(false);
  });

  it('현재 값을 바꾸지 않는다', () => {
    const current = resolvePolicy(undefined);
    applyPolicyPatch(current, { decidesDisposition: true });
    expect(current).toEqual(DEFAULT_LOCATION_POLICY);
  });
});

describe('isSamePolicy', () => {
  it('모든 항목이 같으면 같다', () => {
    expect(isSamePolicy(resolvePolicy(undefined), resolvePolicy({}))).toBe(true);
  });

  it('한 항목이라도 다르면 다르다', () => {
    expect(
      isSamePolicy(
        resolvePolicy(undefined),
        resolvePolicy({ unitReceiptTrigger: 'GOODS_RECEIPT' }),
      ),
    ).toBe(false);
  });
});
