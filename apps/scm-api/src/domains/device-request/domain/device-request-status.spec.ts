import { describe, expect, it } from 'vitest';

import { computeDeviceRequestStatus } from './device-request-status.js';

const counts = (succeeded: number, failed: number, pending: number) => ({
  total: succeeded + failed + pending,
  succeeded,
  failed,
  pending,
});

describe('computeDeviceRequestStatus', () => {
  it('알리기 전이고 결과가 없으면 NOT_NOTIFIED', () => {
    expect(computeDeviceRequestStatus(false, counts(0, 0, 3))).toBe('NOT_NOTIFIED');
  });

  it('알렸고 결과가 없으면 NOTIFIED', () => {
    expect(computeDeviceRequestStatus(true, counts(0, 0, 3))).toBe('NOTIFIED');
  });

  it('일부만 결과가 왔으면 IN_PROGRESS (성공이든 실패든)', () => {
    expect(computeDeviceRequestStatus(true, counts(1, 0, 2))).toBe('IN_PROGRESS');
    expect(computeDeviceRequestStatus(true, counts(0, 1, 2))).toBe('IN_PROGRESS');
  });

  it('모두 성공하면 COMPLETED', () => {
    expect(computeDeviceRequestStatus(true, counts(3, 0, 0))).toBe('COMPLETED');
  });

  it('모두 처리되었고 실패가 있으면 PARTIALLY_FAILED (전부 실패여도)', () => {
    expect(computeDeviceRequestStatus(true, counts(2, 1, 0))).toBe('PARTIALLY_FAILED');
    expect(computeDeviceRequestStatus(true, counts(0, 3, 0))).toBe('PARTIALLY_FAILED');
  });

  it('알림 성공을 기록하기 전에 결과가 먼저 와도 결과를 따른다', () => {
    // 기기 서버는 알림 응답을 돌려주기 전에 시리얼을 가져가 결과를 보낼 수 있다.
    expect(computeDeviceRequestStatus(false, counts(1, 0, 2))).toBe('IN_PROGRESS');
    expect(computeDeviceRequestStatus(false, counts(3, 0, 0))).toBe('COMPLETED');
    expect(computeDeviceRequestStatus(false, counts(2, 1, 0))).toBe('PARTIALLY_FAILED');
  });
});
