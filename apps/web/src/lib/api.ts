import type { OrderView } from '@repo/contracts/oms';
import type { CorrectUnitEventInput, StockRow, UnitLifecycleView } from '@repo/contracts/scm';

/** 서버가 낸 에러. 화면 분기는 code 로 하고, message 는 있으면 보여 주기만 한다. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const request = async <T>(path: string, post?: unknown): Promise<T> => {
  const response = await fetch(
    path,
    post === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(post),
        },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const field = (key: string) =>
      body && typeof body === 'object' && key in body
        ? String((body as Record<string, unknown>)[key])
        : undefined;
    throw new ApiRequestError(response.status, field('code') ?? 'UNKNOWN', field('message'));
  }
  // 응답 형태는 @repo/contracts 의 View 타입으로 서버와 약속되어 있다.
  return (await response.json()) as T;
};

export const api = {
  unit: (serialNumber: string) =>
    request<UnitLifecycleView>(`/api/scm/units/${encodeURIComponent(serialNumber)}`),
  stock: () => request<StockRow[]>('/api/scm/stock'),
  orders: () => request<OrderView[]>('/api/oms/orders'),
  correctEvent: (eventId: string, body: CorrectUnitEventInput) =>
    request<{ correctionId: string }>(`/api/scm/unit-events/${eventId}/corrections`, body),
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
