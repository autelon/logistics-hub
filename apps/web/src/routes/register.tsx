import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import type { DeviceRequestView, RegistrationExclusionReason } from '@repo/contracts/scm';

import { api, formatDateTime } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const EXCLUSION_LABEL: Record<RegistrationExclusionReason, string> = {
  UNIT_NOT_FOUND: '모르는 시리얼',
  NOT_SERIAL_TRACKED: '시리얼 추적 제품이 아님',
  NOT_IN_STOCK: '재고(IN_STOCK)가 아님',
  ALREADY_REGISTERED: '이미 등록됨',
};

/** 줄바꿈·공백·쉼표로 구분된 시리얼 목록. 중복은 한 번만. */
const parseSerials = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  ),
];

const RegisterForm = () => {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [actor, setActor] = useState('');
  const serials = parseSerials(text);

  const register = useMutation({
    mutationFn: () => api.registerUnits({ serialNumbers: serials, actor }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['device-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate();
  };

  const result = register.data;
  return (
    <Card title="제품 등록">
      <form onSubmit={submit} className="space-y-3">
        <textarea
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="등록할 시리얼 번호 (줄바꿈, 공백, 쉼표로 구분)"
          aria-label="시리얼 번호 목록"
          rows={6}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            required
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="처리자"
            aria-label="처리자"
            className="w-40 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            disabled={register.isPending || serials.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            제품 등록하기
          </button>
          <span className="text-sm text-slate-500">{serials.length}건 (한 번에 최대 5000건)</span>
        </div>
      </form>
      {register.error && (
        <p className="mt-3 text-sm text-rose-700">등록하지 못했습니다: {register.error.message}</p>
      )}
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            <span className="font-semibold">등록 {result.registered.length}건</span>
            {result.requestId ? (
              <span className="ml-2 text-slate-500">
                기기 요청 <span className="font-mono">{result.requestId}</span>
              </span>
            ) : (
              <span className="ml-2 text-slate-500">기기 요청 없음</span>
            )}
          </p>
          {result.excluded.length > 0 && (
            <div>
              <p className="font-semibold">제외 {result.excluded.length}건</p>
              <ul className="mt-1 space-y-1 rounded-md bg-amber-50 p-3 text-amber-900">
                {result.excluded.map((item) => (
                  <li key={item.serialNumber}>
                    <span className="font-mono">{item.serialNumber}</span> —{' '}
                    {EXCLUSION_LABEL[item.reason]} ({item.reason})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const FailedItems = ({ requestId }: { requestId: string }) => {
  const query = useQuery({
    queryKey: ['device-request', requestId],
    queryFn: () => api.deviceRequest(requestId),
  });
  if (!query.data) return <QueryState isPending={query.isPending} error={query.error} />;
  return (
    <ul className="mt-2 space-y-1 rounded-md bg-rose-50 p-3 text-xs text-rose-900">
      {query.data.failedItems.map((item) => (
        <li key={item.serialNumber}>
          <span className="font-mono">{item.serialNumber}</span> — {item.reason ?? '사유 없음'}
        </li>
      ))}
    </ul>
  );
};

const RequestRow = ({ request }: { request: DeviceRequestView }) => {
  const [open, setOpen] = useState(false);
  const { counts } = request;
  return (
    <li className="border-l-2 border-slate-200 pl-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{request.type}</span>
        <Badge>{request.status}</Badge>
        <span className="text-slate-500">
          {counts.succeeded}/{counts.total} 성공
        </span>
        {counts.failed > 0 && (
          <button onClick={() => setOpen(!open)} className="text-rose-700 underline">
            실패 {counts.failed}건
          </button>
        )}
        <span className="text-slate-500">{formatDateTime(request.createdAt)}</span>
        <span className="text-xs text-slate-400">
          {request.reason} · {request.createdBy}
        </span>
      </div>
      {open && <FailedItems requestId={request.id} />}
    </li>
  );
};

/** 결과가 다 올 때까지는 2초마다 다시 조회한다. */
const DONE = new Set(['COMPLETED', 'PARTIALLY_FAILED']);

const DeviceRequests = () => {
  const query = useQuery({
    queryKey: ['device-requests'],
    queryFn: api.deviceRequests,
    refetchInterval: (q) =>
      q.state.data?.every((r) => DONE.has(r.status)) === false ? 2000 : false,
  });
  return (
    <Card title="기기 요청 (최근 50건)">
      <QueryState {...query} empty={query.data?.length === 0} />
      {query.data && query.data.length > 0 && (
        <ol className="space-y-3">
          {query.data.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </ol>
      )}
    </Card>
  );
};

const RegisterPage = () => (
  <>
    <RegisterForm />
    <DeviceRequests />
  </>
);

export const Route = createFileRoute('/register')({ component: RegisterPage });
