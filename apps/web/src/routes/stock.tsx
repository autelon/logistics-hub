import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { api } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const StockPage = () => {
  const query = useQuery({ queryKey: ['stock'], queryFn: api.stock });
  return (
    <Card title="SKU · 거점 · 상태별 수량 (정정 반영)">
      <QueryState {...query} empty={query.data?.length === 0} />
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-medium">SKU</th>
                <th className="py-1 pr-4 font-medium">거점</th>
                <th className="py-1 pr-4 font-medium">상태</th>
                <th className="py-1 pr-4 font-medium">등록</th>
                <th className="py-1 text-right font-medium">수량</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => (
                <tr
                  key={`${row.sku}|${row.locationCode}|${row.status}|${row.registered}`}
                  className="border-t border-slate-100"
                >
                  <td className="py-1.5 pr-4 font-mono">{row.sku}</td>
                  <td className="py-1.5 pr-4">{row.locationCode ?? '—'}</td>
                  <td className="py-1.5 pr-4">
                    <Badge>{row.status}</Badge>
                  </td>
                  <td className="py-1.5 pr-4">
                    {row.registered ? (
                      <Badge>등록</Badge>
                    ) : (
                      <span className="text-slate-400">미등록</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const Route = createFileRoute('/stock')({ component: StockPage });
