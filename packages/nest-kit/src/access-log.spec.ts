import { describe, expect, it } from 'vitest';

import { resolveRequestId } from './access-log.js';

describe('resolveRequestId', () => {
  it('짧고 안전한 토큰은 그대로 쓴다', () => {
    for (const id of ['abc-123', 'req_1.2', '4bf92f3577b34da6a3ce929d0e0e4736', 'a'.repeat(64)]) {
      expect(resolveRequestId(id)).toBe(id);
    }
  });

  it('없거나 이상한 값이면 새로 만든다', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const bad = [undefined, '', 'a'.repeat(65), 'has space', 'line\nbreak', '<script>', ['a', 'b']];
    for (const value of bad) {
      expect(resolveRequestId(value)).toMatch(uuid);
    }
  });
});
