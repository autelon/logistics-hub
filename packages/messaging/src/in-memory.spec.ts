import { describe, expect, it } from 'vitest';

import { InMemoryMessageBus } from './in-memory.js';

describe('InMemoryMessageBus', () => {
  it('컨슈머 그룹마다 한 번씩 전달한다', async () => {
    const bus = new InMemoryMessageBus();
    const seen: string[] = [];
    await bus.subscribe('t', 'a', (m) => Promise.resolve(void seen.push(`a:${String(m.value)}`)));
    await bus.subscribe('t', 'b', (m) => Promise.resolve(void seen.push(`b:${String(m.value)}`)));
    await bus.subscribe('other', 'a', () => Promise.resolve(void seen.push('other')));

    await bus.publish('t', { key: 'k', value: 'x' });

    expect(seen).toEqual(['a:x', 'b:x']);
  });
});
