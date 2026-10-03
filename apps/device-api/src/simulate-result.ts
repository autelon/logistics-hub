import type { DeviceRequestItemResult } from '@repo/contracts/scm';

export interface SimulatedResult {
  result: DeviceRequestItemResult;
  reason?: string;
}

/** 모의 처리 결과: `failSerialSuffix` 로 끝나는 시리얼만 실패시켜 실패 흐름을 시험할 수 있게 한다. */
export const simulateResult = (
  serialNumber: string,
  failSerialSuffix: string | undefined,
): SimulatedResult =>
  failSerialSuffix !== undefined && serialNumber.endsWith(failSerialSuffix)
    ? { result: 'FAILED', reason: `simulated failure (serial ends with ${failSerialSuffix})` }
    : { result: 'SUCCEEDED' };
