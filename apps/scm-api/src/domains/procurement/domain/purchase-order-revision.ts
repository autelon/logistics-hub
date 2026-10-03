import type {
  PurchaseOrderLine,
  PurchaseOrderLineDraft,
  ReceivedQuantities,
} from './purchase-order.js';

/** 개정에서 한 줄에 대해 바꿀 항목. 없는 키는 그대로 두고, `null` 은 값을 비운다. */
export interface LinePatch {
  lineNo: number;
  orderedQty?: number | undefined;
  requestedDeliveryDate?: string | undefined;
  unitPrice?: number | null | undefined;
  overTolerancePct?: number | null | undefined;
  underTolerancePct?: number | null | undefined;
}

export interface RevisionChanges {
  updateLines: readonly LinePatch[];
  cancelLines: readonly number[];
  addLines: readonly PurchaseOrderLineDraft[];
}

export type RevisionRefusal =
  | { code: 'PO_LINE_NOT_FOUND'; lineNo: number }
  | { code: 'PO_LINE_CANCELLED'; lineNo: number }
  | { code: 'PO_LINE_ALREADY_CLOSED'; lineNo: number }
  | { code: 'PO_QTY_BELOW_RECEIVED'; lineNo: number; receivedQty: number; requestedQty: number };

export type RevisionResult =
  | {
      ok: true;
      /** 바뀐 기존 줄(바뀐 값이 반영된 전체). 취소한 줄도 여기에 들어 있다. */
      updated: PurchaseOrderLine[];
      /** 새로 추가할 줄. 줄 번호는 기존 최대 번호 다음부터 순서대로. */
      added: (PurchaseOrderLineDraft & { lineNo: number })[];
    }
  | { ok: false; refusal: RevisionRefusal };

/**
 * 개정 내용을 현재 줄에 적용한다. 하나라도 맞지 않으면 아무것도 적용하지 않고 첫 사유를 돌려준다.
 *
 * - 없는 줄은 PO_LINE_NOT_FOUND. 취소한 줄·닫은 줄은 바꾸거나 다시 취소할 수 없다.
 * - 주문 수량을 이미 받은 수량 아래로 줄이거나, 받은 것이 있는 줄을 취소하면 PO_QTY_BELOW_RECEIVED
 *   (줄 취소는 주문 수량을 0 으로 줄이는 것과 같은 규칙이다). 받은 수량과 같게 줄이는 것은 된다.
 * - 줄 번호는 재사용하지 않는다. 추가하는 줄은 취소한 줄을 포함한 기존 최대 번호 다음부터 붙는다.
 */
export const reviseLines = (
  lines: readonly PurchaseOrderLine[],
  changes: RevisionChanges,
  received: ReceivedQuantities,
): RevisionResult => {
  const byNo = new Map(lines.map((line) => [line.lineNo, line]));
  const receivedOf = (line: PurchaseOrderLine) => received.get(line.id) ?? 0;

  const editable = (lineNo: number): PurchaseOrderLine | RevisionRefusal => {
    const line = byNo.get(lineNo);
    if (!line) return { code: 'PO_LINE_NOT_FOUND', lineNo };
    if (line.cancelled) return { code: 'PO_LINE_CANCELLED', lineNo };
    if (line.closed) return { code: 'PO_LINE_ALREADY_CLOSED', lineNo };
    return line;
  };

  const updated: PurchaseOrderLine[] = [];

  for (const patch of changes.updateLines) {
    const line = editable(patch.lineNo);
    if ('code' in line) return { ok: false, refusal: line };
    const orderedQty = patch.orderedQty ?? line.orderedQty;
    if (orderedQty < receivedOf(line)) {
      return {
        ok: false,
        refusal: {
          code: 'PO_QTY_BELOW_RECEIVED',
          lineNo: line.lineNo,
          receivedQty: receivedOf(line),
          requestedQty: orderedQty,
        },
      };
    }
    updated.push({
      ...line,
      orderedQty,
      requestedDeliveryDate: patch.requestedDeliveryDate ?? line.requestedDeliveryDate,
      unitPrice: patch.unitPrice !== undefined ? patch.unitPrice : line.unitPrice,
      overTolerancePct:
        patch.overTolerancePct !== undefined ? patch.overTolerancePct : line.overTolerancePct,
      underTolerancePct:
        patch.underTolerancePct !== undefined ? patch.underTolerancePct : line.underTolerancePct,
    });
  }

  for (const lineNo of changes.cancelLines) {
    const line = editable(lineNo);
    if ('code' in line) return { ok: false, refusal: line };
    if (receivedOf(line) > 0) {
      return {
        ok: false,
        refusal: {
          code: 'PO_QTY_BELOW_RECEIVED',
          lineNo,
          receivedQty: receivedOf(line),
          requestedQty: 0,
        },
      };
    }
    updated.push({ ...line, cancelled: true });
  }

  const lastNo = lines.reduce((max, line) => Math.max(max, line.lineNo), 0);
  const added = changes.addLines.map((draft, i) => ({ ...draft, lineNo: lastNo + 1 + i }));

  return { ok: true, updated, added };
};
