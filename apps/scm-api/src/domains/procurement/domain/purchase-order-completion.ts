import type { LineCompletion } from '@repo/contracts/procurement';

import type { PurchaseOrderLine } from './purchase-order.js';

export interface LineProgress {
  receivedQty: number;
  /** 아직 들어올 것으로 기대하는 수량. OPEN 일 때만 0 보다 클 수 있다. 완료·닫음·취소면 더 기다리지 않으므로 0. */
  openQty: number;
  completion: LineCompletion;
}

type ProgressInput = Pick<
  PurchaseOrderLine,
  'orderedQty' | 'overTolerancePct' | 'underTolerancePct' | 'closed' | 'cancelled'
>;

/** 허용률(%)을 정수(1/100 %)로. 컬럼이 소수 둘째 자리까지라 정확하다. 실수 오차로 경계가 흔들리는 것을 막는다. */
const toBasisPoints = (pct: number | null): number => Math.round((pct ?? 0) * 100);

/**
 * 받은 누계로 줄의 진행 상태를 계산한다.
 *
 * - 누계가 `주문 × (1 + 과납 허용)` 을 넘으면 OVER (이상으로 표시할 상태. 닫았어도 그대로).
 * - 누계가 `주문 × (1 − 미납 허용)` 이상이면 COMPLETE.
 * - 덜 왔는데 닫았으면 CLOSED_SHORT (미달 납품), 아니면 OPEN.
 * - 취소한 줄은 CANCELLED.
 *
 * 허용률이 비어 있으면 0 으로 본다: 주문 수량과 정확히 같아야 완료다.
 * 같은 누계로 계산하므로 입고가 몇 번으로 나뉘어 와도 결과가 같다 (SAP 도 허용치를 품목 단위 누적으로 판단한다).
 */
export const lineProgress = (line: ProgressInput, receivedQty: number): LineProgress => {
  const done = (completion: LineCompletion): LineProgress => ({
    receivedQty,
    openQty: 0,
    completion,
  });
  if (line.cancelled) return done('CANCELLED');

  const received = receivedQty * 10_000;
  const upper = line.orderedQty * (10_000 + toBasisPoints(line.overTolerancePct));
  const lower = line.orderedQty * (10_000 - toBasisPoints(line.underTolerancePct));
  if (received > upper) return done('OVER');
  if (received >= lower) return done('COMPLETE');
  if (line.closed) return done('CLOSED_SHORT');
  return { receivedQty, openQty: line.orderedQty - receivedQty, completion: 'OPEN' };
};

export type CloseLineRefusal =
  'PO_LINE_CANCELLED' | 'PO_LINE_ALREADY_CLOSED' | 'PO_LINE_ALREADY_COMPLETE';

/**
 * 줄을 닫을 수 없는 사유. 닫기는 "덜 왔는데 더 안 온다"는 선언이라 아직 OPEN 인 줄에만 한다.
 * 이미 다 받았거나(COMPLETE) 넘치게 받은(OVER) 줄을 닫는 것은 의미가 없어 거절한다.
 */
export const closeLineRefusal = (
  line: ProgressInput,
  receivedQty: number,
): CloseLineRefusal | undefined => {
  if (line.cancelled) return 'PO_LINE_CANCELLED';
  if (line.closed) return 'PO_LINE_ALREADY_CLOSED';
  const { completion } = lineProgress(line, receivedQty);
  if (completion === 'COMPLETE' || completion === 'OVER') return 'PO_LINE_ALREADY_COMPLETE';
  return undefined;
};
