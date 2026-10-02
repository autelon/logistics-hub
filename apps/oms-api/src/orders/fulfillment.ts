import type { FulfillmentItemStatus, SellableKind } from '@repo/contracts/oms';

export interface SellableDefinition {
  code: string;
  name: string;
  kind: SellableKind;
  components: readonly { sku: string; quantity: number }[];
}

export interface PlannedLine {
  lineNo: number;
  sellableCode: string;
  sellableName: string;
  sellableKind: SellableKind;
  quantity: number;
  /** 이 줄을 채우기 위해 출고해야 하는 물리 제품들의 SKU. 한 개당 한 칸. */
  skus: string[];
}

export class UnknownSellableError extends Error {
  constructor(readonly codes: string[]) {
    super(`Unknown sellable: ${codes.join(', ')}`);
  }
}

export const sellableKindOf = (
  components: readonly { sku: string; quantity: number }[],
): SellableKind =>
  components.length === 1 && components[0]?.quantity === 1 ? 'SINGLE' : 'PACKAGE';

/** 주문 줄을 물리 출고 단위로 푼다. 패키지 2개 주문이면 구성품 전체가 2벌 나온다. */
export const planOrder = (
  lines: readonly { sellableCode: string; quantity: number }[],
  sellables: ReadonlyMap<string, SellableDefinition>,
): PlannedLine[] => {
  const unknown = [...new Set(lines.map((l) => l.sellableCode).filter((c) => !sellables.has(c)))];
  if (unknown.length > 0) throw new UnknownSellableError(unknown);

  return lines.map((line, index) => {
    const sellable = sellables.get(line.sellableCode)!;
    const oneSet = sellable.components.flatMap((c) => Array<string>(c.quantity).fill(c.sku));
    return {
      lineNo: index + 1,
      sellableCode: sellable.code,
      sellableName: sellable.name,
      sellableKind: sellable.kind,
      quantity: line.quantity,
      skus: Array.from({ length: line.quantity }, () => oneSet).flat(),
    };
  });
};

interface PendingCandidate {
  id: string;
  sku: string;
  status: FulfillmentItemStatus;
}

/**
 * 출고 보고를 어느 항목에 붙일지 고른다. 업체가 항목 id 를 알려 주면 그 항목,
 * 아니면 같은 SKU 의 아직 안 나간 항목 중 가장 먼저 만들어진 것.
 */
export const pickItemForShipment = <T extends PendingCandidate>(
  items: readonly T[],
  shipment: { sku: string; fulfillmentItemId: string | null },
): T | undefined => {
  const pending = items
    .filter((i) => i.status === 'PENDING' && i.sku === shipment.sku)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  if (shipment.fulfillmentItemId) {
    return pending.find((i) => i.id === shipment.fulfillmentItemId);
  }
  return pending[0];
};

/** 취소·불량으로 빠진 항목을 뺀 나머지가 전부 배송 완료면 주문이 채워진 것이다. */
export const orderStatusOf = (statuses: readonly FulfillmentItemStatus[]): 'OPEN' | 'FULFILLED' => {
  const active = statuses.filter((s) => s !== 'CANCELLED' && s !== 'DOA');
  return active.length > 0 && active.every((s) => s === 'DELIVERED') ? 'FULFILLED' : 'OPEN';
};
