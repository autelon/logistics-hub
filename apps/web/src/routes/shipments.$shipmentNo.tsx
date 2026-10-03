import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';

import { api, formatDateTime } from '../lib/api';
import { Card, QueryState } from '../lib/ui';

const ShipmentPage = () => {
  const { shipmentNo } = Route.useParams();
  const query = useQuery({
    queryKey: ['shipment', shipmentNo],
    queryFn: () => api.shipment(shipmentNo),
  });
  const shipment = query.data;
  if (!shipment) {
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
          <span className="font-mono text-base font-semibold">{shipment.shipmentNo}</span>
          <span className="text-sm text-slate-500">
            <Link to="/shipments" className="underline">
              목록
            </Link>
          </span>
        </div>
        {shipment.anomalies.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            {shipment.anomalies.map((anomaly) => (
              <li key={`${anomaly.code}|${anomaly.lineNo}|${anomaly.message}`}>
                ⚠ <span className="font-mono">{anomaly.code}</span>
                {anomaly.lineNo !== null && ` (줄 ${anomaly.lineNo})`}: {anomaly.message}
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">발주</dt>
          <dd className="font-mono">
            {shipment.poNumber ? (
              <Link
                to="/purchase-orders/$poNumber"
                params={{ poNumber: shipment.poNumber }}
                className="text-sky-700 underline"
              >
                {shipment.poNumber}
              </Link>
            ) : (
              <span className="text-amber-700">연결되지 않음</span>
            )}
          </dd>
          <dt className="text-slate-500">제출된 발주 번호</dt>
          <dd className="font-mono">{shipment.reportedPoNumber}</dd>
          <dt className="text-slate-500">B/L · 인보이스</dt>
          <dd className="font-mono">
            {shipment.blNumber} · {shipment.invoiceNumber ?? '—'}
          </dd>
          <dt className="text-slate-500">제조사 · 운송</dt>
          <dd>
            {shipment.shipper} · {shipment.mode}
          </dd>
          <dt className="text-slate-500">출하일 · 도착 예정</dt>
          <dd>
            {shipment.shipDate ?? '—'} · {shipment.eta ?? '—'}
          </dd>
          <dt className="text-slate-500">출처</dt>
          <dd>
            {shipment.source.system}
            {shipment.source.ref ? ` (${shipment.source.ref})` : ''}
          </dd>
          <dt className="text-slate-500">보고 · 기록</dt>
          <dd>
            {formatDateTime(shipment.reportedAt)} · {formatDateTime(shipment.recordedAt)}
          </dd>
          <dt className="text-slate-500">메모</dt>
          <dd>{shipment.note ?? '—'}</dd>
        </dl>
      </Card>

      <Card title="선적 줄">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-medium">줄</th>
                <th className="py-1 pr-4 font-medium">SKU</th>
                <th className="py-1 pr-4 text-right font-medium">수량</th>
                <th className="py-1 pr-4 text-right font-medium">시리얼</th>
                <th className="py-1 pr-4 font-medium">로트</th>
                <th className="py-1 font-medium">발주 줄</th>
              </tr>
            </thead>
            <tbody>
              {shipment.lines.map((line) => (
                <tr key={line.lineNo} className="border-t border-slate-100">
                  <td className="py-1.5 pr-4 tabular-nums">{line.lineNo}</td>
                  <td className="py-1.5 pr-4 font-mono">{line.sku}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{line.serialCount}</td>
                  <td className="py-1.5 pr-4 font-mono">{line.lotNo ?? '—'}</td>
                  <td className="py-1.5">{line.poLineNo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {shipment.link && (
        <Card title="연결 기록">
          <p className="text-sm">
            <span className="text-slate-500">{formatDateTime(shipment.link.linkedAt)}</span>{' '}
            <span className="font-medium">{shipment.link.actor}</span> 이(가){' '}
            <span className="font-mono">{shipment.link.previousShipmentNo}</span> 을(를){' '}
            <span className="font-mono">{shipment.link.poNumber}</span> 에 연결:{' '}
            {shipment.link.reason}
          </p>
        </Card>
      )}
    </>
  );
};

export const Route = createFileRoute('/shipments/$shipmentNo')({ component: ShipmentPage });
