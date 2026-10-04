/**
 * 사실 여러 건을 한꺼번에 정정(무효화)할 때 실제로 정정할 것과 건너뛸 것을 가른다.
 * 한 사실은 한 번만 정정되므로(`unit_event_corrections.target_event_id` unique), 이미 정정된 사실은 건너뛴다.
 * 단건 정정 명령은 같은 경우에 거절하지만(`UNIT_EVENT_ALREADY_CORRECTED`), 선적 무효화 같은 일괄 경로에서는
 * 앞서 사람이 따로 정정한 사실이 섞여 있을 수 있어 건너뛰고 건수를 돌려준다.
 */
export const partitionVoidable = <T extends { event: { id: string } }>(
  targets: readonly T[],
  correctedEventIds: ReadonlySet<string>,
): { voidable: T[]; skipped: T[] } => {
  const voidable: T[] = [];
  const skipped: T[] = [];
  for (const target of targets) {
    (correctedEventIds.has(target.event.id) ? skipped : voidable).push(target);
  }
  return { voidable, skipped };
};
