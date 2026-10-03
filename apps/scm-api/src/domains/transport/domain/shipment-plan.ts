import type { TrackingMode } from '@repo/contracts/scm';

import type { ShipmentAnomaly } from './shipment.js';

/**
 * 선적을 발주에 맞출 때 쓰는 발주 줄. 발주(procurement) 도메인의 타입을 가져올 수 없어
 * usecase 가 필요한 값만 옮겨 담는다.
 */
export interface OrderedLine {
  id: string;
  lineNo: number;
  productId: string;
  orderedQty: number;
  /** 과납 허용률(%). null 이면 허용 없음. */
  overTolerancePct: number | null;
  closed: boolean;
  cancelled: boolean;
}

export interface PlanningOrder {
  poNumber: string;
  lines: readonly OrderedLine[];
}

/** 발주 줄 id → 이미 연결된 선적 수량 누계. */
export type ShippedByLine = ReadonlyMap<string, number>;

/** 맞출 선적 줄. */
export interface PlanLine {
  /** 1부터. 제출한 순서. */
  lineNo: number;
  sku: string;
  productId: string;
  trackingMode: TrackingMode;
  quantity: number;
  /** 제출된 그대로(중복 포함). */
  serialNumbers: readonly string[];
}

/** 허용률(%)을 정수(1/100 %)로. 소수 둘째 자리까지라 정확하다. 실수 오차로 경계가 흔들리는 것을 막는다. */
const toBasisPoints = (pct: number | null): number => Math.round((pct ?? 0) * 100);

/** 이 줄의 주문 수량 + 과납 허용을 `total` 이 넘는가. (procurement 의 `lineProgress` 와 같은 정수 계산이다.) */
const exceedsAllowance = (line: OrderedLine, total: number): boolean =>
  total * 10_000 > line.orderedQty * (10_000 + toBasisPoints(line.overTolerancePct));

/**
 * 선적 줄 하나를 맞출 발주 줄을 고른다. 같은 제품의 줄 가운데 다음 순서로 먼저 해당하는 것의 가장 작은 줄 번호:
 * 1. 닫지도 취소하지도 않았고 아직 남은 수량이 있는 줄 (주문 수량 > 선적 누계)
 * 2. 닫지도 취소하지도 않은 줄 (이미 다 선적됨 → 넘치면 `OVER_SHIPPED`)
 * 3. 닫은 줄 (`PO_LINE_CLOSED`)
 * 4. 취소한 줄 (`PO_LINE_CANCELLED`)
 * 같은 제품의 줄이 없으면 undefined.
 */
export const pickOrderLine = (
  lines: readonly OrderedLine[],
  productId: string,
  shipped: ShippedByLine,
): OrderedLine | undefined => {
  const sameProduct = lines
    .filter((line) => line.productId === productId)
    .toSorted((a, b) => a.lineNo - b.lineNo);
  const active = sameProduct.filter((line) => !line.closed && !line.cancelled);
  return (
    active.find((line) => line.orderedQty - (shipped.get(line.id) ?? 0) > 0) ??
    active[0] ??
    sameProduct.find((line) => !line.cancelled) ??
    sameProduct[0]
  );
};

export interface OrderMatch {
  /** 선적 줄과 같은 순서. 맞는 발주 줄이 없으면 undefined. */
  matches: (OrderedLine | undefined)[];
  /** 발주 줄과 관련된 이상: 줄 없음, 닫힘, 취소, 과납. */
  anomalies: ShipmentAnomaly[];
  /** 이 선적이 발주 줄에 더하는 수량. */
  added: Map<string, number>;
}

/**
 * 선적 줄들을 발주 줄에 맞추고 발주 줄과 관련된 이상을 찾는다.
 * 같은 선적의 앞 줄이 더한 수량은 뒤 줄이 볼 선적 누계에 들어간다.
 */
export const matchToOrder = (
  lines: readonly Pick<PlanLine, 'lineNo' | 'sku' | 'productId' | 'quantity'>[],
  order: PlanningOrder,
  shipped: ShippedByLine,
): OrderMatch => {
  const running = new Map(shipped);
  const added = new Map<string, number>();
  const anomalies: ShipmentAnomaly[] = [];

  const matches = lines.map((line) => {
    const picked = pickOrderLine(order.lines, line.productId, running);
    if (!picked) {
      anomalies.push({
        code: 'PO_LINE_UNMATCHED',
        message: `발주 ${order.poNumber} 에 ${line.sku} 줄이 없음`,
        lineNo: line.lineNo,
      });
      return undefined;
    }

    const total = (running.get(picked.id) ?? 0) + line.quantity;
    running.set(picked.id, total);
    added.set(picked.id, (added.get(picked.id) ?? 0) + line.quantity);

    if (picked.cancelled) {
      anomalies.push({
        code: 'PO_LINE_CANCELLED',
        message: `${line.sku} 이(가) 취소된 발주 줄 ${picked.lineNo} 으로 선적됨`,
        lineNo: line.lineNo,
      });
    } else {
      if (picked.closed) {
        anomalies.push({
          code: 'PO_LINE_CLOSED',
          message: `${line.sku} 이(가) 닫힌 발주 줄 ${picked.lineNo} 으로 선적됨`,
          lineNo: line.lineNo,
        });
      }
      if (exceedsAllowance(picked, total)) {
        anomalies.push({
          code: 'OVER_SHIPPED',
          message: `발주 줄 ${picked.lineNo} (${line.sku}) 선적 누계 ${total} 이(가) 주문 ${picked.orderedQty} + 과납 허용을 넘음`,
          lineNo: line.lineNo,
        });
      }
    }
    return picked;
  });

  return { matches, anomalies, added };
};

/** 연결하려는 발주에 맞는 줄이 없는 선적 줄이 있으면 거절한다. */
export type LinkPlan =
  | {
      ok: true;
      matches: { lineNo: number; purchaseOrderLineId: string }[];
      anomalies: ShipmentAnomaly[];
    }
  | { ok: false; unmatched: { lineNo: number; sku: string }[] };

/**
 * 운영자가 선적을 발주에 연결할 때 줄을 맞춰 본다.
 * 모든 줄이 발주 줄에 맞아야 연결할 수 있다. 닫히거나 취소된 줄에 맞는 것은 연결은 되고 이상으로 남는다.
 */
export const planLink = (
  lines: readonly Pick<PlanLine, 'lineNo' | 'sku' | 'productId' | 'quantity'>[],
  order: PlanningOrder,
  shipped: ShippedByLine,
): LinkPlan => {
  const { matches, anomalies } = matchToOrder(lines, order, shipped);
  const unmatched = lines.flatMap((line, i) =>
    matches[i] ? [] : [{ lineNo: line.lineNo, sku: line.sku }],
  );
  if (unmatched.length > 0) return { ok: false, unmatched };

  return {
    ok: true,
    matches: lines.flatMap((line, i) => {
      const matched = matches[i];
      return matched ? [{ lineNo: line.lineNo, purchaseOrderLineId: matched.id }] : [];
    }),
    anomalies,
  };
};

/** 선적을 어디에 맞출지. */
export type PlanTarget =
  | { kind: 'ORDER'; order: PlanningOrder; shipped: ShippedByLine }
  /** 모르는 번호이거나 ISSUED 가 아닌 발주. `reason` 은 이상 메시지에 들어간다. */
  | { kind: 'UNLINKED'; reason: string };

export interface PlanContext {
  target: PlanTarget;
  /** 이미 다른 선적에 있는 시리얼 (같은 요청의 앞 선적 포함). */
  knownSerials: ReadonlySet<string>;
  /** 이미 있는 제품 개체의 시리얼 → 제품 id. */
  unitProducts: ReadonlyMap<string, string>;
}

export interface PlannedLine {
  purchaseOrderLineId: string | null;
  /** 중복을 뺀 시리얼 (저장할 목록). */
  serialNumbers: string[];
  /** 제품 이력에 `DISPATCHED` 를 남길 시리얼: 시리얼 추적 제품이고, 제품이 다른 개체가 아니며, 이 선적에서 처음 나온 것. */
  recordableSerials: string[];
}

export interface ShipmentPlan {
  linked: boolean;
  lines: PlannedLine[];
  anomalies: ShipmentAnomaly[];
  /** 이 선적이 발주 줄에 더하는 수량. 같은 요청의 뒤 선적이 볼 누계에 합친다. */
  shippedDelta: Map<string, number>;
}

const SAMPLE = 5;

/** 이상 메시지에 싣는 시리얼 예시: 앞 몇 개와 나머지 건수. 시리얼 수천 개를 메시지에 싣지 않는다. */
const sample = (serials: readonly string[]): string =>
  serials.length <= SAMPLE
    ? serials.join(', ')
    : `${serials.slice(0, SAMPLE).join(', ')} 외 ${serials.length - SAMPLE}건`;

/**
 * 선적 하나를 발주에 맞추고(`ORDER`) 보고된 내용의 이상을 찾는다. 거부하는 것은 없다.
 *
 * 이상의 종류는 `ShipmentAnomalyCode`. 시리얼 목록은 제품이 시리얼 추적일 때만 개체로 이어지고
 * (`recordableSerials`), 다른 제품으로 이미 있는 시리얼은 이상으로 표시하고 이력을 남기지 않는다.
 */
export const planShipment = (lines: readonly PlanLine[], context: PlanContext): ShipmentPlan => {
  const { target, knownSerials, unitProducts } = context;
  const anomalies: ShipmentAnomaly[] = [];

  let match: OrderMatch | undefined;
  if (target.kind === 'ORDER') {
    match = matchToOrder(lines, target.order, target.shipped);
  } else {
    anomalies.push({ code: 'PO_UNLINKED', message: target.reason, lineNo: null });
  }

  const seenInShipment = new Set<string>();
  const planned = lines.map((line, i): PlannedLine => {
    const distinct = [...new Set(line.serialNumbers)];
    const repeated = line.serialNumbers.length - distinct.length;
    const inEarlierLine = distinct.filter((serial) => seenInShipment.has(serial));
    const inOtherShipment = distinct.filter((serial) => knownSerials.has(serial));
    const serialTracked = line.trackingMode === 'SERIAL';

    if (repeated > 0 || inEarlierLine.length > 0) {
      anomalies.push({
        code: 'DUPLICATE_SERIAL',
        message: `이 선적 안에서 시리얼이 중복됨 (같은 줄 ${repeated}건${
          inEarlierLine.length > 0 ? `, 앞 줄과 겹침 ${sample(inEarlierLine)}` : ''
        })`,
        lineNo: line.lineNo,
      });
    }
    if (inOtherShipment.length > 0) {
      anomalies.push({
        code: 'DUPLICATE_SERIAL',
        message: `다른 선적에 이미 있는 시리얼: ${sample(inOtherShipment)}`,
        lineNo: line.lineNo,
      });
    }

    if (!serialTracked && distinct.length > 0) {
      anomalies.push({
        code: 'SERIALS_ON_UNTRACKED_PRODUCT',
        message: `${line.sku} 은(는) 시리얼 추적 제품이 아닌데 시리얼 ${distinct.length}개가 옴 (개체는 만들지 않음)`,
        lineNo: line.lineNo,
      });
    }
    if (serialTracked && distinct.length !== line.quantity) {
      anomalies.push({
        code: 'SERIAL_COUNT_MISMATCH',
        message:
          distinct.length === 0
            ? `${line.sku} 시리얼 목록이 없음 (수량 ${line.quantity})`
            : `${line.sku} 시리얼 ${distinct.length}개, 수량 ${line.quantity}`,
        lineNo: line.lineNo,
      });
    }

    const conflicting = serialTracked
      ? distinct.filter((serial) => {
          const existing = unitProducts.get(serial);
          return existing !== undefined && existing !== line.productId;
        })
      : [];
    if (conflicting.length > 0) {
      anomalies.push({
        code: 'SERIAL_SKU_CONFLICT',
        message: `이미 다른 SKU 로 등록된 시리얼 (${line.sku} 가 아님): ${sample(conflicting)}. 이력을 남기지 않음`,
        lineNo: line.lineNo,
      });
    }

    const conflictSet = new Set(conflicting);
    const recordableSerials = serialTracked
      ? distinct.filter((serial) => !conflictSet.has(serial) && !seenInShipment.has(serial))
      : [];
    for (const serial of distinct) seenInShipment.add(serial);

    return {
      purchaseOrderLineId: match?.matches[i]?.id ?? null,
      serialNumbers: distinct,
      recordableSerials,
    };
  });

  // 발주 줄에 관한 이상(줄 없음·닫힘·취소·과납)을 맨 앞(선적 전체의 이상 다음)에 둔다.
  const orderAnomalies = match?.anomalies ?? [];
  const [shipmentWide, perLine] = [
    anomalies.filter((anomaly) => anomaly.lineNo === null),
    anomalies.filter((anomaly) => anomaly.lineNo !== null),
  ];
  return {
    linked: target.kind === 'ORDER',
    lines: planned,
    anomalies: [...shipmentWide, ...orderAnomalies, ...perLine],
    shippedDelta: match?.added ?? new Map(),
  };
};
