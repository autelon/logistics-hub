import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import type { UnitEventView } from '@repo/contracts/scm';

import { api, formatDateTime } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const EventRow = ({ event, serialNumber }: { event: UnitEventView; serialNumber: string }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [actor, setActor] = useState('');

  const voidEvent = useMutation({
    mutationFn: () => api.correctEvent(event.id, { reason, actor }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['unit', serialNumber] });
    },
  });

  const voided = event.correction !== null;
  return (
    <li className="border-l-2 border-slate-200 pl-3 text-sm">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${voided ? 'opacity-50' : ''}`}>
        <span className={`font-medium ${voided ? 'line-through' : ''}`}>{event.type}</span>
        <span className="text-slate-500">{formatDateTime(event.occurredAt)}</span>
        {event.locationCode && <span className="text-slate-500">@ {event.locationCode}</span>}
        {event.orderRef && <span className="text-slate-500">주문 {event.orderRef.orderId}</span>}
        {event.caseId && <span className="text-slate-500">케이스 {event.caseId}</span>}
        <span className="text-xs text-slate-400">출처 {event.source.system}</span>
        {!voided && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-xs text-slate-500 underline"
          >
            잘못된 기록으로 표시
          </button>
        )}
      </div>
      {event.correction && (
        <p className="mt-1 text-xs text-slate-500">
          {formatDateTime(event.correction.recordedAt)} {event.correction.actor} 님이 무효 처리:{' '}
          {event.correction.reason}
          {event.correction.replacementEventId && ' (대체 기록 있음)'}
        </p>
      )}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            voidEvent.mutate();
          }}
          className="mt-2 flex flex-wrap gap-2"
        >
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유"
            aria-label="사유"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
          />
          <input
            required
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="처리자"
            aria-label="처리자"
            className="w-28 rounded border border-slate-300 px-2 py-1"
          />
          <button
            disabled={voidEvent.isPending}
            className="rounded bg-rose-700 px-3 py-1 text-white disabled:opacity-50"
          >
            무효 처리
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-2 text-slate-500">
            취소
          </button>
          {voidEvent.error && (
            <p className="w-full text-xs text-rose-700">
              처리하지 못했습니다: {voidEvent.error.message}
            </p>
          )}
        </form>
      )}
    </li>
  );
};

const UnitLifecycle = ({ serialNumber }: { serialNumber: string }) => {
  const query = useQuery({
    queryKey: ['unit', serialNumber],
    queryFn: () => api.unit(serialNumber),
  });
  if (!query.data) return <QueryState isPending={query.isPending} error={query.error} />;
  const unit = query.data;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-mono text-base font-semibold">{unit.serialNumber}</span>
          <Badge>{unit.status}</Badge>
          <span className="text-slate-500">SKU {unit.sku}</span>
          {unit.locationCode && <span className="text-slate-500">거점 {unit.locationCode}</span>}
          {unit.orderRef && <span className="text-slate-500">주문 {unit.orderRef.orderId}</span>}
        </div>
        {unit.anomalies.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            {unit.anomalies.map((anomaly) => (
              <li key={anomaly}>⚠ {anomaly}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="이력">
        <ol className="space-y-3">
          {unit.events.map((event) => (
            <EventRow key={event.id} event={event} serialNumber={serialNumber} />
          ))}
        </ol>
      </Card>
    </>
  );
};

const UnitTracePage = () => {
  const { sn } = Route.useSearch();
  const navigate = useNavigate({ from: '/' });
  const [input, setInput] = useState(sn ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    void navigate({ search: next ? { sn: next } : {} });
  };

  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="시리얼 번호"
          aria-label="시리얼 번호"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          조회
        </button>
      </form>
      {sn ? (
        <UnitLifecycle serialNumber={sn} />
      ) : (
        <p className="text-sm text-slate-500">
          시리얼 번호로 제품 한 개의 제조부터 폐기까지 전체 이력을 조회합니다.
        </p>
      )}
    </>
  );
};

export const Route = createFileRoute('/')({
  validateSearch: (search): { sn?: string } =>
    typeof search['sn'] === 'string' && search['sn'] ? { sn: search['sn'] } : {},
  component: UnitTracePage,
});
