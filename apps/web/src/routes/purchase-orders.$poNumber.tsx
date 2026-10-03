import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { api, formatDateTime } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const RevisionList = ({ poNumber }: { poNumber: string }) => {
  const query = useQuery({
    queryKey: ['purchase-order-revisions', poNumber],
    queryFn: () => api.purchaseOrderRevisions(poNumber),
  });
  return (
    <Card title="개정 이력">
      <QueryState {...query} empty={query.data?.length === 0} />
      <ul className="space-y-1 text-sm">
        {query.data?.map((revision) => (
          <li key={revision.id}>
            <span className="text-slate-500">{formatDateTime(revision.revisedAt)}</span>{' '}
            <span className="font-medium">{revision.actor}</span> — {revision.reason}
          </li>
        ))}
      </ul>
    </Card>
  );
};

const ShipmentList = ({ poNumber }: { poNumber: string }) => {
  const query = useQuery({
    queryKey: ['shipments', { poNumber }],
    queryFn: () => api.shipments({ poNumber }),
  });
  return (
    <Card title="선적 차수">
      <QueryState {...query} empty={query.data?.length === 0} />
      <ul className="space-y-1 text-sm">
        {query.data?.map((shipment) => (
          <li key={shipment.shipmentNo}>
            <Link
              to="/shipments/$shipmentNo"
              params={{ shipmentNo: shipment.shipmentNo }}
              className="font-mono text-sky-700 underline"
            >
              {shipment.shipmentNo}
            </Link>{' '}
            <span className="text-slate-500">
              B/L {shipment.blNumber} · {shipment.mode} · 수량 {shipment.totalQty} · 시리얼{' '}
              {shipment.serialCount}
            </span>
            {shipment.anomalyCount > 0 && (
              <span className="ml-2 text-amber-700">⚠ 이상 {shipment.anomalyCount}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};

const PurchaseOrderPage = () => {
  const { poNumber } = Route.useParams();
  const query = useQuery({
    queryKey: ['purchase-order', poNumber],
    queryFn: () => api.purchaseOrder(poNumber),
  });
  const order = query.data;
  if (!order) {
    return (
      <Card>
        <QueryState {...query} />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-base font-semibold">{order.poNumber}</span>
          <Badge>{order.status}</Badge>
          <span className="text-sm text-slate-500">
            <Link to="/purchase-orders" className="underline">
              목록
            </Link>
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">공급처</dt>
          <dd>{order.supplier}</dd>
          <dt className="text-slate-500">발주일 · 통화</dt>
          <dd>
            {order.orderDate} · {order.currency}
          </dd>
          <dt className="text-slate-500">입고 거점</dt>
          <dd>{order.destinationLocationCode}</dd>
          <dt className="text-slate-500">인도 조건</dt>
          <dd>{order.incoterm ? `${order.incoterm} ${order.incotermPlace ?? ''}` : '—'}</dd>
          <dt className="text-slate-500">결제 조건</dt>
          <dd>{order.paymentTerms ?? '—'}</dd>
          <dt className="text-slate-500">작성</dt>
          <dd>
            {order.createdBy} · {formatDateTime(order.createdAt)}
          </dd>
          <dt className="text-slate-500">발행</dt>
          <dd>
            {order.issuedAt && order.issuedBy
              ? `${order.issuedBy} · ${formatDateTime(order.issuedAt)}`
              : '—'}
          </dd>
        </dl>
      </Card>

      <Card title="발주 줄">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-medium">줄</th>
                <th className="py-1 pr-4 font-medium">SKU</th>
                <th className="py-1 pr-4 text-right font-medium">주문</th>
                <th className="py-1 pr-4 text-right font-medium">선적</th>
                <th className="py-1 pr-4 text-right font-medium">받음</th>
                <th className="py-1 pr-4 text-right font-medium">남음</th>
                <th className="py-1 pr-4 font-medium">납기</th>
                <th className="py-1 pr-4 font-medium">진행</th>
                <th className="py-1 font-medium">닫음 사유</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr
                  key={line.lineNo}
                  className={`border-t border-slate-100 ${line.cancelled ? 'opacity-50' : ''}`}
                >
                  <td className="py-1.5 pr-4 tabular-nums">{line.lineNo}</td>
                  <td className="py-1.5 pr-4 font-mono">{line.sku}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.orderedQty}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.shippedQty}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.receivedQty}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.openQty}</td>
                  <td className="py-1.5 pr-4">{line.requestedDeliveryDate}</td>
                  <td className="py-1.5 pr-4">
                    <Badge>{line.completion}</Badge>
                  </td>
                  <td className="py-1.5 text-slate-500">
                    {line.closed && line.closedBy
                      ? `${line.closedBy}: ${line.closeReason ?? ''}`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ShipmentList poNumber={poNumber} />

      <RevisionList poNumber={poNumber} />
    </>
  );
};

export const Route = createFileRoute('/purchase-orders/$poNumber')({
  component: PurchaseOrderPage,
});
