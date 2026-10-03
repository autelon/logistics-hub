import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

import { api, formatDateTime } from '../lib/api';
import { Badge, Card, QueryState } from '../lib/ui';

const ShipmentsPage = () => {
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const query = useQuery({
    queryKey: ['shipments', { unlinkedOnly }],
    queryFn: () => api.shipments(unlinkedOnly ? { unlinked: true } : {}),
  });
  return (
    <Card title="최근 선적 50건">
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unlinkedOnly}
          onChange={(e) => setUnlinkedOnly(e.target.checked)}
        />
        발주에 연결되지 않은 것만
      </label>
      <QueryState {...query} empty={query.data?.length === 0} />
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-4 font-medium">선적 번호</th>
                <th className="py-1 pr-4 font-medium">발주</th>
                <th className="py-1 pr-4 font-medium">B/L</th>
                <th className="py-1 pr-4 font-medium">운송</th>
                <th className="py-1 pr-4 font-medium">출하일</th>
                <th className="py-1 pr-4 text-right font-medium">수량</th>
                <th className="py-1 pr-4 text-right font-medium">시리얼</th>
                <th className="py-1 pr-4 font-medium">이상</th>
                <th className="py-1 font-medium">기록</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((shipment) => (
                <tr key={shipment.shipmentNo} className="border-t border-slate-100">
                  <td className="py-1.5 pr-4 font-mono">
                    <Link
                      to="/shipments/$shipmentNo"
                      params={{ shipmentNo: shipment.shipmentNo }}
                      className="text-sky-700 underline"
                    >
                      {shipment.shipmentNo}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 font-mono">
                    {shipment.poNumber ?? (
                      <span className="text-amber-700">미연결 ({shipment.reportedPoNumber})</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4 font-mono">{shipment.blNumber}</td>
                  <td className="py-1.5 pr-4">{shipment.mode}</td>
                  <td className="py-1.5 pr-4">{shipment.shipDate ?? '—'}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{shipment.totalQty}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{shipment.serialCount}</td>
                  <td className="py-1.5 pr-4">
                    {shipment.anomalyCount > 0 ? (
                      <Badge>{`이상 ${shipment.anomalyCount}`}</Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-slate-500">{formatDateTime(shipment.recordedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const Route = createFileRoute('/shipments/')({ component: ShipmentsPage });
