import { describe, expect, it } from 'vitest';

import { partitionVoidable } from './unit-void.js';

const target = (id: string) => ({ event: { id } });

describe('partitionVoidable', () => {
  it('이미 정정된 사실은 건너뛰고 나머지를 정정할 대상으로 남긴다. 순서는 유지한다', () => {
    const { voidable, skipped } = partitionVoidable(
      [target('E1'), target('E2'), target('E3'), target('E4')],
      new Set(['E2', 'E4', 'E9']),
    );
    expect(voidable.map((t) => t.event.id)).toEqual(['E1', 'E3']);
    expect(skipped.map((t) => t.event.id)).toEqual(['E2', 'E4']);
  });

  it('정정된 것이 없으면 전부 정정한다', () => {
    const { voidable, skipped } = partitionVoidable([target('E1')], new Set());
    expect(voidable).toHaveLength(1);
    expect(skipped).toEqual([]);
  });
});
