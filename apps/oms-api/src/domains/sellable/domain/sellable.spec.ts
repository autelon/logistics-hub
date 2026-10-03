import { describe, expect, it } from 'vitest';

import { mergeComponents, sellableKindOf } from './sellable.js';

describe('sellableKindOf', () => {
  it('구성품 1종 1개만 단품이다', () => {
    expect(sellableKindOf([{ sku: 'A', quantity: 1 }])).toBe('SINGLE');
    expect(sellableKindOf([{ sku: 'A', quantity: 2 }])).toBe('PACKAGE');
    expect(
      sellableKindOf([
        { sku: 'A', quantity: 1 },
        { sku: 'B', quantity: 1 },
      ]),
    ).toBe('PACKAGE');
  });
});

describe('mergeComponents', () => {
  it('같은 SKU 는 수량을 합치고 처음 나온 순서를 유지한다', () => {
    expect(
      mergeComponents([
        { sku: 'B', quantity: 1 },
        { sku: 'A', quantity: 2 },
        { sku: 'B', quantity: 3 },
      ]),
    ).toEqual([
      { sku: 'B', quantity: 4 },
      { sku: 'A', quantity: 2 },
    ]);
  });

  it('합친 결과로 종류를 정하면 같은 SKU 2개도 패키지다', () => {
    const merged = mergeComponents([
      { sku: 'A', quantity: 1 },
      { sku: 'A', quantity: 1 },
    ]);
    expect(sellableKindOf(merged)).toBe('PACKAGE');
  });
});
