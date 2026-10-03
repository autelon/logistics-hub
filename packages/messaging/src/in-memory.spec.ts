import { describe, expect, it } from 'vitest';

import { InMemoryMessageBus } from './in-memory.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('InMemoryMessageBus', () => {
  it('컨슈머 그룹마다 한 번씩 전달한다', async () => {
    const bus = new InMemoryMessageBus();
    const seen: string[] = [];
    await bus.subscribe('t', 'a', (m) => Promise.resolve(void seen.push(`a:${String(m.value)}`)));
    await bus.subscribe('t', 'b', (m) => Promise.resolve(void seen.push(`b:${String(m.value)}`)));
    await bus.subscribe('other', 'a', () => Promise.resolve(void seen.push('other')));

    await bus.publish('t', { key: 'k', value: 'x' });
    await bus.idle();

    expect(seen).toEqual(['a:x', 'b:x']);
  });

  it('publish 는 핸들러를 기다리지 않고 돌아온다 (발행자의 스택·트랜잭션 안에서 핸들러가 돌지 않는다)', async () => {
    const bus = new InMemoryMessageBus();
    const gate = deferred();
    let started = false;
    let finished = false;
    await bus.subscribe('t', 'a', async () => {
      started = true;
      await gate.promise;
      finished = true;
    });

    await bus.publish('t', { key: 'k', value: 1 });
    expect(started).toBe(false);
    expect(finished).toBe(false);

    gate.resolve();
    await bus.idle();
    expect(started).toBe(true);
    expect(finished).toBe(true);
  });

  it('같은 그룹 안에서는 발행 순서대로 하나씩 처리한다', async () => {
    const bus = new InMemoryMessageBus();
    const log: string[] = [];
    await bus.subscribe('t', 'a', async (m) => {
      log.push(`start ${String(m.value)}`);
      // 첫 메시지를 더 오래 걸리게 해도 두 번째가 먼저 끝나지 않는다.
      await new Promise((resolve) => setTimeout(resolve, m.value === 1 ? 20 : 0));
      log.push(`end ${String(m.value)}`);
    });

    await bus.publish('t', { key: 'k', value: 1 });
    await bus.publish('t', { key: 'k', value: 2 });
    await bus.idle();

    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('핸들러가 실패하면 발행자에게 던지지 않고 기록한 뒤 같은 메시지를 다시 시도한다', async () => {
    const errors: string[] = [];
    const bus = new InMemoryMessageBus({
      retryAfterMs: 5,
      onError: (_error, context) => void errors.push(context),
    });
    const attempts: number[] = [];
    await bus.subscribe('t', 'a', (m) => {
      attempts.push(Number(m.value));
      if (attempts.length === 1) return Promise.reject(new Error('first attempt fails'));
      return Promise.resolve();
    });

    await bus.publish('t', { key: 'k', value: 1 });
    await bus.publish('t', { key: 'k', value: 2 });
    await bus.idle();

    expect(attempts).toEqual([1, 1, 2]);
    expect(errors).toEqual(['handler t/a message 1']);
  });

  it('close 하면 남은 메시지와 재시도를 버리고 idle 이 풀린다', async () => {
    const bus = new InMemoryMessageBus({ retryAfterMs: 10_000, onError: () => {} });
    let calls = 0;
    await bus.subscribe('t', 'a', () => {
      calls += 1;
      return Promise.reject(new Error('always fails'));
    });

    await bus.publish('t', { key: 'k', value: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBe(1);

    await bus.close();
    await bus.idle();
    expect(calls).toBe(1);
  });
});
