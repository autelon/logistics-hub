import { describe, expect, it } from 'vitest';

import { MAX_ATTEMPTS, retryOnConflict } from './retry-on-conflict.js';

class Conflict extends Error {}
class Other extends Error {}

/** 앞의 `failures` 번은 주어진 에러로 실패하고 그다음부터 성공하는 처리. */
const flaky = (failures: Error[]) => {
  let calls = 0;
  const attempt = () => {
    const failure = failures[calls];
    calls += 1;
    return failure ? Promise.reject(failure) : Promise.resolve(`ok after ${calls}`);
  };
  return { attempt, calls: () => calls };
};

describe('retryOnConflict', () => {
  it('성공하면 한 번만 부른다', async () => {
    const run = flaky([]);
    expect(await retryOnConflict(Conflict, run.attempt)).toBe('ok after 1');
    expect(run.calls()).toBe(1);
  });

  it('졌다는 에러면 처음부터 다시 한다', async () => {
    const run = flaky([new Conflict()]);
    expect(await retryOnConflict(Conflict, run.attempt)).toBe('ok after 2');
    expect(run.calls()).toBe(2);
  });

  it('다른 에러는 다시 하지 않고 그대로 던진다', async () => {
    const error = new Other('boom');
    const run = flaky([error]);
    await expect(retryOnConflict(Conflict, run.attempt)).rejects.toBe(error);
    expect(run.calls()).toBe(1);
  });

  it('시도를 다 쓰고도 지면 마지막 에러를 던진다', async () => {
    const failures = Array.from(
      { length: MAX_ATTEMPTS + 1 },
      (_, i) => new Conflict(`failure ${i + 1}`),
    );
    const last = failures[MAX_ATTEMPTS - 1];
    const run = flaky(failures);
    await expect(retryOnConflict(Conflict, run.attempt)).rejects.toBe(last);
    expect(run.calls()).toBe(MAX_ATTEMPTS);
  });
});
