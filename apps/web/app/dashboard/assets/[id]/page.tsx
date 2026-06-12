'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  assetsApi, checklistsApi, workOrdersApi,
  Asset, Execution, WorkOrder,
} from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { formatDate, formatDateTime, isOverdue } from '../../../../lib/auth';

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TimelineKind = 'execution' | 'workorder' | 'maintenance' | 'install';

interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  date: string;
  title: string;
  sub: string;
  icon: string;
  accent: string;
  href?: string;
  score?: number | null;
  status?: string;
}

function buildTimeline(
  asset: Asset,
  executions: Execution[],
  workOrders: WorkOrder[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (asset.installDate) {
    events.push({
      id: 'install',
      kind: 'install',
      date: asset.installDate,
      title: 'Equipamento instalado',
      sub: asset.unit.name,
      icon: 'IN',
      accent: 'border-slate-200 bg-slate-50',
    });
  }

  if (asset.lastMaintenanceAt) {
    events.push({
      id: 'maint',
      kind: 'maintenance',
      date: asset.lastMaintenanceAt,
      title: 'Manutenção realizada',
      sub: 'Última manutenção registrada',
      icon: 'MA',
      accent: 'border-blue-100 bg-blue-50',
    });
  }

  for (const ex of executions) {
    const score = ex.score;
    events.push({
      id: ex.id,
      kind: 'execution',
      date: ex.completedAt ?? ex.createdAt,
      title: ex.checklist.name,
      sub: `por ${ex.user.name}`,
      icon: 'CH',
      accent: score !== null && score < 70 ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50',
      href: `/dashboard/executions/${ex.id}`,
      score,
      status: ex.status,
    });
  }

  for (const wo of workOrders) {
    const done = wo.status === 'COMPLETED' || wo.status === 'CANCELLED';
    events.push({
      id: wo.id,
      kind: 'workorder',
      date: wo.completedAt ?? wo.updatedAt ?? wo.createdAt,
      title: wo.title,
      sub: `${wo.code} · ${wo.unit.name}`,
      icon: 'OS',
      accent: done ? 'border-slate-100 bg-slate-50' : 'border-amber-100 bg-amber-50',
      href: `/dashboard/work-orders/${wo.id}`,
      status: wo.status,
    });
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Asset Detail Page ────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [assetRes, qrRes, execRes, woRes] = await Promise.allSettled([
        assetsApi.get(id),
        assetsApi.qrData(id),
        checklistsApi.executions({ assetId: id, limit: 20 }),
        workOrdersApi.list({ assetId: id, limit: 20 }),
      ]);

      if (assetRes.status === 'fulfilled') setAsset(assetRes.value.data);
      if (qrRes.status === 'fulfilled') setQrDataUrl(qrRes.value.data.dataUrl);
      if (execRes.status === 'fulfilled') setExecutions(execRes.value.data.data);
      if (woRes.status === 'fulfilled') {
        const all = woRes.value.data.data;
        setWorkOrders(all.filter((w: WorkOrder) => w.asset?.id === id));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!asset) return <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>Equipamento não encontrado</div>;

  const maint = isOverdue(asset.nextMaintenanceAt) && asset.status === 'ACTIVE';
  const CATEGORY_MARKS: Record<string, string> = {
    Elevadores: 'EL', Elétrica: 'EE', Hidráulica: 'HI',
    Segurança: 'SE', HVAC: 'HV', Incêndio: 'IN',
  };
  const icon = CATEGORY_MARKS[asset.category] ?? asset.category.slice(0, 2).toUpperCase();

  const timeline = buildTimeline(asset, executions, workOrders);
  const visibleTimeline = timelineExpanded ? timeline : timeline.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link href="/dashboard/assets" className="hover:text-blue-600">Equipamentos</Link>
        <span>/</span>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{asset.code ?? asset.name}</span>
      </div>

      {/* Header */}
      <div className="fluent-card p-5 sm:p-6"
        style={{
          borderColor: maint ? '#fcd34d' : 'var(--border)',
        }}>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <div className="flex items-start gap-4 mb-4">
              <span
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-black"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {icon}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {asset.code && <span className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>{asset.code}</span>}
                  <Badge value={asset.status} />
                  {maint && <span className="fluent-badge bg-red-100 text-red-700">Manutenção vencida</span>}
                </div>
                <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{asset.name}</h1>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{asset.category} · {asset.unit.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {asset.brand && <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Marca</p><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{asset.brand}</p></div>}
              {asset.model && <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Modelo</p><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{asset.model}</p></div>}
              {asset.serialNumber && <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nº de série</p><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{asset.serialNumber}</p></div>}
              {asset.installDate && <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Instalado em</p><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDate(asset.installDate)}</p></div>}
              {asset.lastMaintenanceAt && <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Última manutenção</p><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatDate(asset.lastMaintenanceAt)}</p></div>}
              {asset.nextMaintenanceAt && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Próxima manutenção</p>
                  <p className={`font-semibold ${maint ? 'text-red-600' : ''}`}
                    style={maint ? {} : { color: 'var(--text-primary)' }}>{formatDate(asset.nextMaintenanceAt)}</p>
                </div>
              )}
            </div>

            {asset.description && (
              <p className="text-sm mt-4 p-3 rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--surface-2)' }}>{asset.description}</p>
            )}
          </div>

          {qrDataUrl && (
            <div className="flex-shrink-0">
              <div className="border-2 rounded-xl p-3 text-center"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <img src={qrDataUrl} alt="QR Code" className="w-36 h-36" />
                <p className="text-xs mt-2 font-mono" style={{ color: 'var(--text-muted)' }}>{asset.qrCode.substring(0, 16)}...</p>
                <a href={qrDataUrl} download={`${asset.code ?? asset.id}-qr.png`}
                  className="mt-2 block text-xs text-blue-600 hover:underline">Baixar QR Code</a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline do Equipamento */}
      <div className="fluent-card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Histórico do Equipamento</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {executions.length} execuções · {workOrders.length} ordens de serviço
            </p>
          </div>
          {timeline.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum registro ainda</span>
          )}
        </div>

        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum histórico registrado para este equipamento</p>
          </div>
        ) : (
          <div className="relative">
            {/* Linha vertical */}
            <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />

            <div className="space-y-3">
              {visibleTimeline.map((ev) => {
                const content = (
                  <div className={`ml-10 flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${ev.href ? 'hover:shadow-sm cursor-pointer' : ''} ${ev.accent}`}>
                    <div className="absolute left-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 text-[9px] font-black"
                      style={{ background: 'var(--surface)' }}>
                      {ev.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{ev.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{ev.sub}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {ev.status && <Badge value={ev.status} />}
                      {ev.score !== undefined && ev.score !== null && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ev.score >= 80 ? 'bg-green-100 text-green-700' : ev.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {ev.score}%
                        </span>
                      )}
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateTime(ev.date)}</p>
                    </div>
                  </div>
                );

                return (
                  <div key={ev.id} className="relative">
                    {ev.href ? <Link href={ev.href}>{content}</Link> : content}
                  </div>
                );
              })}
            </div>

            {timeline.length > 5 && (
              <button
                onClick={() => setTimelineExpanded(!timelineExpanded)}
                className="mt-4 ml-10 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                {timelineExpanded ? '▲ Mostrar menos' : `▼ Ver mais ${timeline.length - 5} eventos`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/work-orders"
          className="fluent-button fluent-button-primary h-11 px-5 text-sm">
          + Abrir OS para este equipamento
        </Link>
        <Link href="/dashboard/checklists"
          className="fluent-button fluent-button-secondary h-11 px-5 text-sm">
          Executar checklist
        </Link>
      </div>
    </div>
  );
}
