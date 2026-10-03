import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { api } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const PurchaseOrdersPage = () => {
  const query = useQuery({ queryKey: ['purchase-orders'], queryFn: api.purchaseOrders });
  return (
    <Card title="최근 발주 50건">
      <QueryState {...query} empty={query.data?.length === 0} />
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-medium">발주 번호</th>
                <th className="py-1 pr-4 font-medium">공급처</th>
                <th className="py-1 pr-4 font-medium">발주일</th>
                <th className="py-1 pr-4 font-medium">상태</th>
                <th className="py-1 pr-4 font-medium">입고 거점</th>
                <th className="py-1 pr-4 text-right font-medium">줄</th>
                <th className="py-1 text-right font-medium">수량</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((order) => (
                <tr key={order.poNumber} className="border-t border-slate-100">
                  <td className="py-1.5 pr-4 font-mono">
                    <Link
                      to="/purchase-orders/$poNumber"
                      params={{ poNumber: order.poNumber }}
                      className="text-sky-700 underline"
                    >
                      {order.poNumber}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4">{order.supplier}</td>
                  <td className="py-1.5 pr-4">{order.orderDate}</td>
                  <td className="py-1.5 pr-4">
                    <Badge>{order.status}</Badge>
                  </td>
                  <td className="py-1.5 pr-4">{order.destinationLocationCode}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{order.lineCount}</td>
                  <td className="py-1.5 text-right tabular-nums">{order.orderedQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const Route = createFileRoute('/purchase-orders/')({ component: PurchaseOrdersPage });
