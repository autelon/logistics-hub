import { describe, expect, it } from 'vitest';

import { AmbientTransaction } from './transaction.js';

interface FakeTx {
  name: string;
}

/** 열린 순서대로 tx-1, tx-2 … 를 만들고 커밋·롤백을 기록하는 가짜 연결. */
const setup = () => {
  const log: string[] = [];
  let opened = 0;
  const root: FakeTx = { name: 'root' };
  const ambient = new AmbientTransaction<FakeTx>(root, async (work) => {
    opened += 1;
    const tx: FakeTx = { name: `tx-${opened}` };
    log.push(`begin ${tx.name}`);
    try {
      const result = await work(tx);
      log.push(`commit ${tx.name}`);
      return result;
    } catch (error) {
      log.push(`rollback ${tx.name}`);
      throw error;
    }
  });
  return { ambient, log, root };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('AmbientTransaction', () => {
  it('run 밖에서는 루트 연결을 준다', () => {
    const { ambient, root } = setup();
    expect(ambient.current()).toBe(root);
    expect(ambient.isActive()).toBe(false);
  });

  it('run 안에서는 await 를 넘어서도 트랜잭션 핸들을 주고, 끝나면 커밋한다', async () => {
    const { ambient, log, root } = setup();
    const result = await ambient.run(async () => {
      const before = ambient.current().name;
      await tick();
      return [before, ambient.current().name, ambient.isActive()];
    });
    expect(result).toEqual(['tx-1', 'tx-1', true]);
    expect(log).toEqual(['begin tx-1', 'commit tx-1']);
    expect(ambient.current()).toBe(root);
  });

  it('예외가 나면 롤백하고 예외를 그대로 던진다', async () => {
    const { ambient, log, root } = setup();
    await expect(
      ambient.run(async () => {
        await tick();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(log).toEqual(['begin tx-1', 'rollback tx-1']);
    expect(ambient.current()).toBe(root);
  });

  it('중첩된 run 은 새로 열지 않고 바깥 트랜잭션에 합류한다', async () => {
    const { ambient, log } = setup();
    const names = await ambient.run(async () => {
      const outer = ambient.current().name;
      const inner = await ambient.run(async () => {
        await tick();
        return ambient.current().name;
      });
      return [outer, inner, ambient.current().name];
    });
    expect(names).toEqual(['tx-1', 'tx-1', 'tx-1']);
    expect(log).toEqual(['begin tx-1', 'commit tx-1']);
  });

  it('중첩된 run 에서 난 예외는 바깥 트랜잭션 전체를 롤백한다', async () => {
    const { ambient, log } = setup();
    await expect(
      ambient.run(async () => {
        await ambient.run(async () => {
          await tick();
          throw new Error('inner');
        });
      }),
    ).rejects.toThrow('inner');
    expect(log).toEqual(['begin tx-1', 'rollback tx-1']);
  });

  it('동시에 실행된 run 은 서로의 트랜잭션을 보지 못한다', async () => {
    const { ambient, log } = setup();
    const work = (steps: number) => async () => {
      const seen = new Set<string>();
      for (let i = 0; i < steps; i += 1) {
        seen.add(ambient.current().name);
        await tick();
      }
      return [...seen];
    };
    const [a, b, outside] = await Promise.all([
      ambient.run(work(5)),
      ambient.run(work(3)),
      work(4)(),
    ]);
    expect(a).toEqual(['tx-1']);
    expect(b).toEqual(['tx-2']);
    expect(outside).toEqual(['root']);
    expect(log.filter((line) => line.startsWith('begin'))).toEqual(['begin tx-1', 'begin tx-2']);
  });
});
