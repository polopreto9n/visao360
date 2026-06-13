'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { assetsApi, RecurringIssueAsset } from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { formatDate } from '../../../../lib/auth';

export default function RecurringIssuesPage() {
  const [assets, setAssets] = useState<RecurringIssueAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    setLoading(true);
    assetsApi.recurringIssues(months)
      .then((res) => setAssets(res.data))
      .finally(() => setLoading(false));
  }, [months]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Problemas recorrentes</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Equipamentos com 2 ou mais ordens de serviço nos últimos {months} meses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/assets" className="fluent-button fluent-button-secondary h-11 px-4 text-sm">
            ← Equipamentos
          </Link>
          <select
            className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 h-11"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : assets.length === 0 ? (
        <div className="fluent-card p-16 text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum problema recorrente</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Nenhum equipamento teve 2 ou mais ordens de serviço no período selecionado.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assets.map((asset) => (
            <div key={asset.id} className="fluent-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/dashboard/assets/${asset.id}`} className="font-bold hover:underline" style={{ color: 'var(--text-primary)' }}>
                    {asset.name}
                  </Link>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{asset.category} · {asset.unit.name}</p>
                </div>
                <span className="fluent-badge bg-red-50 text-red-700">{asset.issueCount} ordens de serviço</span>
              </div>
              <div className="space-y-1.5">
                {asset.workOrders.map((wo) => (
                  <div key={wo.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-2)' }}>
                    <div className="min-w-0">
                      <span className="font-mono mr-2" style={{ color: 'var(--text-muted)' }}>{wo.code}</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{wo.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge value={wo.priority} type="priority" />
                      <Badge value={wo.status} />
                      <span style={{ color: 'var(--text-muted)' }}>{formatDate(wo.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
