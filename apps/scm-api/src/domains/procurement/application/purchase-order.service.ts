import { Inject, Injectable } from '@nestjs/common';

import { scmError } from '../../../errors.js';
import { closeLineRefusal } from '../domain/purchase-order-completion.js';
import {
  reviseLines,
  type RevisionChanges,
  type RevisionRefusal,
} from '../domain/purchase-order-revision.js';
import {
  numberLines,
  snapshotOf,
  type PurchaseOrderDetail,
  type PurchaseOrderHeader,
  type PurchaseOrderLine,
  type PurchaseOrderLineDraft,
  type PurchaseOrderRevision,
  type ReceivedQuantityLookup,
} from '../domain/purchase-order.js';
import { PurchaseOrderRepository } from '../domain/purchase-order.repository.js';

/** 개정 이력으로 돌려주는 최대 건수. */
const REVISIONS_LIMIT = 50;

export interface ActorReason {
  reason: string;
  actor: string;
}

const refuseRevision = (refusal: RevisionRefusal) => {
  if (refusal.code === 'PO_QTY_BELOW_RECEIVED') {
    return scmError(
      refusal.code,
      `Line ${refusal.lineNo} already received ${refusal.receivedQty}`,
      {
        lineNo: refusal.lineNo,
        receivedQty: refusal.receivedQty,
        requestedQty: refusal.requestedQty,
      },
    );
  }
  return scmError(refusal.code, `Line ${refusal.lineNo}: ${refusal.code}`);
};

const requireIssued = ({ order }: PurchaseOrderDetail, verb: 'revised' | 'closed') => {
  if (order.status !== 'ISSUED') {
    throw scmError(
      'PO_NOT_ISSUED',
      `${order.poNumber} is ${order.status}; only an issued purchase order can be ${verb}`,
    );
  }
};

/**
 * 발주서의 작성·발행·개정·줄 닫기·취소. 우리가 내리는 명령이라 전제가 맞지 않으면 에러 코드로 거절한다.
 *
 * 바꾸는 메서드는 트랜잭션 안에서, 첫 쿼리로 발주 행을 잠그며 시작한다(`findByPoNumberForUpdate`).
 * 받은 수량은 이 도메인이 모르는 입고·선적에서 오므로 호출한 usecase 가 `receivedOf` 로 넘긴다.
 * 바꾸는 메서드는 모두 바뀐 뒤의 발주를 돌려준다.
 */
@Injectable()
export class PurchaseOrderService {
  constructor(@Inject(PurchaseOrderRepository) private readonly orders: PurchaseOrderRepository) {}

  /** 초안(DRAFT)을 만든다. 줄 번호는 배열 순서대로 1부터. */
  create(
    header: PurchaseOrderHeader,
    lines: readonly PurchaseOrderLineDraft[],
    actor: string,
    now: Date = new Date(),
  ): Promise<PurchaseOrderDetail> {
    return this.orders.insert({
      ...header,
      status: 'DRAFT',
      createdAt: now,
      createdBy: actor,
      issuedAt: null,
      issuedBy: null,
      lines: numberLines(lines),
    });
  }

  async get(poNumber: string): Promise<PurchaseOrderDetail> {
    const detail = await this.orders.findByPoNumber(poNumber);
    if (!detail) throw scmError('PO_NOT_FOUND', `Unknown purchase order ${poNumber}`);
    return detail;
  }

  list(limit: number): Promise<PurchaseOrderDetail[]> {
    return this.orders.listRecent(limit);
  }

  async listRevisions(poNumber: string): Promise<PurchaseOrderRevision[]> {
    const { order } = await this.get(poNumber);
    return this.orders.listRevisions(order.id, REVISIONS_LIMIT);
  }

  /** 초안을 통째로 바꾼다 (헤더와 줄 모두). 초안은 자유롭게 고치므로 이력을 남기지 않는다. */
  async replaceDraft(
    poNumber: string,
    header: PurchaseOrderHeader,
    lines: readonly PurchaseOrderLineDraft[],
  ): Promise<PurchaseOrderDetail> {
    const { order } = await this.lock(poNumber);
    if (order.status !== 'DRAFT') {
      throw scmError('PO_NOT_DRAFT', `${poNumber} is ${order.status}; only a draft can be edited`);
    }
    await this.orders.replaceDraftContents(order.id, header, numberLines(lines));
    return this.get(poNumber);
  }

  async issue(
    poNumber: string,
    actor: string,
    now: Date = new Date(),
  ): Promise<PurchaseOrderDetail> {
    const { order } = await this.lock(poNumber);
    if (order.status !== 'DRAFT') {
      throw scmError('PO_NOT_DRAFT', `${poNumber} is ${order.status}; only a draft can be issued`);
    }
    await this.orders.markIssued(order.id, now, actor);
    return this.get(poNumber);
  }

  /**
   * 발행된 발주의 줄을 바꾼다: 수량·납기·단가·허용률 변경, 줄 추가, 줄 취소.
   * 실제로 바뀐 것이 있으면 변경 전후 전체를 개정 이력에 남기고, 바뀐 것이 없으면 아무것도 남기지 않는다.
   */
  async revise(
    poNumber: string,
    { reason, actor }: ActorReason,
    changes: RevisionChanges,
    receivedOf: ReceivedQuantityLookup,
    now: Date = new Date(),
  ): Promise<PurchaseOrderDetail> {
    const before = await this.lock(poNumber);
    requireIssued(before, 'revised');

    const received = await receivedOf(before.lines.map((line) => line.id));
    const result = reviseLines(before.lines, changes, received);
    if (!result.ok) throw refuseRevision(result.refusal);

    for (const line of result.updated) await this.orders.saveLine(line);
    await this.orders.addLines(before.order.id, result.added);

    const after = await this.get(poNumber);
    const [beforeSnapshot, afterSnapshot] = [snapshotOf(before), snapshotOf(after)];
    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
      await this.orders.addRevision({
        purchaseOrderId: before.order.id,
        revisedAt: now,
        actor,
        reason,
        before: beforeSnapshot,
        after: afterSnapshot,
      });
    }
    return after;
  }

  /** 줄을 닫는다: 덜 왔는데 더 안 온다는 선언. 이미 다 받았거나 넘친 줄은 닫을 수 없다. */
  async closeLine(
    poNumber: string,
    lineNo: number,
    { reason, actor }: ActorReason,
    receivedOf: ReceivedQuantityLookup,
    now: Date = new Date(),
  ): Promise<PurchaseOrderDetail> {
    const detail = await this.lock(poNumber);
    requireIssued(detail, 'closed');

    const line = detail.lines.find((candidate) => candidate.lineNo === lineNo);
    if (!line) throw scmError('PO_LINE_NOT_FOUND', `Unknown line ${lineNo}`);

    const receivedQty = (await receivedOf([line.id])).get(line.id) ?? 0;
    const refusal = closeLineRefusal(line, receivedQty);
    if (refusal) throw scmError(refusal, `Line ${lineNo} cannot be closed`);

    const closed: PurchaseOrderLine = {
      ...line,
      closed: true,
      closedAt: now,
      closedBy: actor,
      closeReason: reason,
    };
    await this.orders.saveLine(closed);
    return this.get(poNumber);
  }

  /**
   * 발주를 취소한다. 받은 것이 하나라도 있으면 거절한다. 발행된 발주의 취소는 개정 이력에 남는다
   * (초안은 자유롭게 고치는 문서라 남기지 않는다).
   */
  async cancel(
    poNumber: string,
    { reason, actor }: ActorReason,
    receivedOf: ReceivedQuantityLookup,
    now: Date = new Date(),
  ): Promise<PurchaseOrderDetail> {
    const before = await this.lock(poNumber);
    if (before.order.status === 'CANCELLED') {
      throw scmError('PO_ALREADY_CANCELLED', `${poNumber} is already cancelled`);
    }

    const received = await receivedOf(before.lines.map((line) => line.id));
    const withReceipts = before.lines.filter((line) => (received.get(line.id) ?? 0) > 0);
    if (withReceipts.length > 0) {
      throw scmError('PO_HAS_RECEIPTS', `${poNumber} has received quantities`, {
        lineNos: withReceipts.map((line) => line.lineNo),
      });
    }

    await this.orders.markCancelled(before.order.id);
    const after = await this.get(poNumber);
    if (before.order.status === 'ISSUED') {
      await this.orders.addRevision({
        purchaseOrderId: before.order.id,
        revisedAt: now,
        actor,
        reason,
        before: snapshotOf(before),
        after: snapshotOf(after),
      });
    }
    return after;
  }

  private async lock(poNumber: string): Promise<PurchaseOrderDetail> {
    const detail = await this.orders.findByPoNumberForUpdate(poNumber);
    if (!detail) throw scmError('PO_NOT_FOUND', `Unknown purchase order ${poNumber}`);
    return detail;
  }
}
