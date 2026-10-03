import { describe, expect, it } from 'vitest';

import { simulateResult } from './simulate-result.js';

describe('simulateResult', () => {
  it('접미사를 설정하지 않으면 전부 성공이다', () => {
    expect(simulateResult('SN-1', undefined)).toEqual({ result: 'SUCCEEDED' });
  });

  it('접미사로 끝나는 시리얼만 실패시킨다', () => {
    expect(simulateResult('SN-FAIL', '-FAIL')).toEqual({
      result: 'FAILED',
      reason: 'simulated failure (serial ends with -FAIL)',
    });
    expect(simulateResult('SN-FAIL-2', '-FAIL')).toEqual({ result: 'SUCCEEDED' });
  });
});
