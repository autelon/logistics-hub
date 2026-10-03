import type { SellableKind } from '@repo/contracts/oms';

export interface SellableComponent {
  sku: string;
  quantity: number;
}

/** 채널에서 파는 단위. 단품도 "구성품 1개짜리"로 같은 구조에 담는다. */
export interface Sellable {
  code: string;
  name: string;
  kind: SellableKind;
  components: SellableComponent[];
}

/** 구성품 1종 1개만 단품이다. 그 밖은 전부 패키지. */
export const sellableKindOf = (components: readonly SellableComponent[]): SellableKind =>
  components.length === 1 && components[0]?.quantity === 1 ? 'SINGLE' : 'PACKAGE';

/** 같은 SKU 가 여러 번 오면 수량을 합친다. 처음 나온 순서를 유지한다. */
export const mergeComponents = (components: readonly SellableComponent[]): SellableComponent[] => {
  const quantities = new Map<string, number>();
  for (const c of components) quantities.set(c.sku, (quantities.get(c.sku) ?? 0) + c.quantity);
  return [...quantities].map(([sku, quantity]) => ({ sku, quantity }));
};
