import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { api, formatDateTime } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const OrdersPage = () => {
  const query = useQuery({ queryKey: ['orders'], queryFn: api.orders });
  if (!query.data || query.data.length === 0) {
    return (
      <Card>
        <QueryState {...query} empty={query.data?.length === 0} />
      </Card>
    );
  }

  return query.data.map((order) => (
    <Card key={order.id}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">
          {order.channel} · {order.channelOrderNo}
        </span>
        <Badge>{order.status}</Badge>
        <span className="text-slate-500">{formatDateTime(order.orderedAt)}</span>
      </div>
      {order.lines.map((line) => (
        <div key={line.id} className="mt-3 text-sm">
          <p className="font-medium">
            {line.sellableName} × {line.quantity}
            {line.sellableKind === 'PACKAGE' && (
              <span className="ml-2 text-xs font-normal text-slate-500">패키지</span>
            )}
          </p>
          <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3">
            {line.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono">{item.sku}</span>
                <Badge>{item.status}</Badge>
                {item.serialNumber ? (
                  <Link
                    to="/"
                    search={{ sn: item.serialNumber }}
                    className="font-mono text-sky-700 underline"
                  >
                    {item.serialNumber}
                  </Link>
                ) : (
                  <span className="text-slate-400">시리얼 미정</span>
                )}
                {item.reason === 'DOA_REPLACEMENT' && (
                  <span className="text-xs text-slate-500">DOA 교체 출고</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  ));
};

export const Route = createFileRoute('/orders')({ component: OrdersPage });
