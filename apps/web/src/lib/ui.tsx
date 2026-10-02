import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  good: 'bg-emerald-100 text-emerald-800',
  info: 'bg-sky-100 text-sky-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-rose-100 text-rose-800',
} as const;

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  IN_STOCK: 'good',
  DELIVERED: 'good',
  FULFILLED: 'good',
  SHIPPED: 'info',
  IN_TRANSIT: 'info',
  PRODUCED: 'info',
  PENDING: 'warn',
  OPEN: 'warn',
  RETURNED: 'warn',
  DOA: 'bad',
  SCRAPPED: 'bad',
};

export const Badge = ({ children }: { children: string }) => {
  const tone = TONES[STATUS_TONE[children] ?? 'neutral'];
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}>
      {children}
    </span>
  );
};

export const Card = ({ title, children }: { title?: string; children: ReactNode }) => {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-500">{title}</h2>}
      {children}
    </section>
  );
};

export const QueryState = ({
  isPending,
  error,
  empty,
}: {
  isPending: boolean;
  error: Error | null;
  empty?: boolean;
}) => {
  if (isPending) return <p className="text-sm text-slate-500">불러오는 중…</p>;
  if (error) return <p className="text-sm text-rose-700">불러오지 못했습니다: {error.message}</p>;
  if (empty) return <p className="text-sm text-slate-500">아직 데이터가 없습니다.</p>;
  return null;
};
