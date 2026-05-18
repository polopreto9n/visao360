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
      icon: '🏗️',
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
      icon: '🛠️',
      accent: 'border-blue-100 bg-blue-50',
    });
  }

  for (const ex of executions) {
    const score = ex.score;
    const scoreColor = score === null ? '' : score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-600' : 'text-red-600';
    events.push({
      id: ex.id,
      kind: 'execution',
      date: ex.completedAt ?? ex.createdAt,
      title: ex.checklist.name,
      sub: `por ${ex.user.name}`,
      icon: '📋',
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
      icon: '🔧',
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
  if (!asset) return <div className="text-center py-20 text-slate-500">Equipamento não encontrado</div>;

  const maint = isOverdue(asset.nextMaintenanceAt) && asset.status === 'ACTIVE';
  const CATEGORY_ICONS: Record<string, string> = {
    Elevadores: '🛗', Elétrica: '⚡', Hidráulica: '💧',
    Segurança: '📹', HVAC: '❄️', Incêndio: '🔥',
  };
  const icon = CATEGORY_ICONS[asset.category] ?? '🏗️';

  const timeline = buildTimeline(asset, executions, workOrders);
  const visibleTimeline = timelineExpanded ? timeline : timeline.slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/assets" className="hover:text-blue-600">Equipamentos</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{asset.code ?? asset.name}</span>
      </div>

      {/* Header */}
      <div className={`bg-white rounded-xl border p-6 shadow-sm ${maint ? 'border-amber-200' : 'border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <div className="flex items-start gap-4 mb-4">
              <span className="text-4xl">{icon}</span>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {asset.code && <span className="font-mono text-sm text-slate-400">{asset.code}</span>}
                  <Badge value={asset.status} />
                  {maint && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠️ Manutenção VENCIDA</span>}
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900">{asset.name}</h1>
                <p className="text-sm text-slate-500 mt-0.5">{asset.category} · {asset.unit.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {asset.brand && <div><p className="text-xs text-slate-400">Marca</p><p className="font-semibold">{asset.brand}</p></div>}
              {asset.model && <div><p className="text-xs text-slate-400">Modelo</p><p className="font-semibold">{asset.model}</p></div>}
              {asset.serialNumber && <div><p className="text-xs text-slate-400">Nº de série</p><p className="font-semibold">{asset.serialNumber}</p></div>}
              {asset.installDate && <div><p className="text-xs text-slate-400">Instalado em</p><p className="font-semibold">{formatDate(asset.installDate)}</p></div>}
              {asset.lastMaintenanceAt && <div><p className="text-xs text-slate-400">Última manutenção</p><p className="font-semibold">{formatDate(asset.lastMaintenanceAt)}</p></div>}
              {asset.nextMaintenanceAt && (
                <div>
                  <p className="text-xs text-slate-400">Próxima manutenção</p>
                  <p className={`font-semibold ${maint ? 'text-red-600' : ''}`}>{formatDate(asset.nextMaintenanceAt)}</p>
                </div>
              )}
            </div>

            {asset.description && (
              <p className="text-sm text-slate-600 mt-4 p-3 bg-slate-50 rounded-lg">{asset.description}</p>
            )}
          </div>

          {qrDataUrl && (
            <div className="flex-shrink-0">
              <div className="bg-white border-2 border-slate-200 rounded-xl p-3 text-center">
                <img src={qrDataUrl} alt="QR Code" className="w-36 h-36" />
                <p className="text-xs text-slate-400 mt-2 font-mono">{asset.qrCode.substring(0, 16)}...</p>
                <a href={qrDataUrl} download={`${asset.code ?? asset.id}-qr.png`}
                  className="mt-2 block text-xs text-blue-600 hover:underline">⬇ Baixar QR Code</a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline do Equipamento */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-gray-900">Histórico do Equipamento</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {executions.length} execuções · {workOrders.length} ordens de serviço
            </p>
          </div>
          {timeline.length === 0 && (
            <span className="text-xs text-slate-400">Nenhum registro ainda</span>
          )}
        </div>

        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-slate-400">Nenhum histórico registrado para este equipamento</p>
          </div>
        ) : (
          <div className="relative">
            {/* Linha vertical */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

            <div className="space-y-3">
              {visibleTimeline.map((ev) => {
                const content = (
                  <div className={`ml-10 flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${ev.href ? 'hover:shadow-sm cursor-pointer' : ''} ${ev.accent}`}>
                    <div className="absolute left-2 w-5 h-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center text-xs">
                      {ev.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ev.sub}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {ev.status && <Badge value={ev.status} />}
                      {ev.score !== undefined && ev.score !== null && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ev.score >= 80 ? 'bg-green-100 text-green-700' : ev.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {ev.score}%
                        </span>
                      )}
                      <p className="text-xs text-slate-400">{formatDateTime(ev.date)}</p>
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
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          + Abrir OS para este equipamento
        </Link>
        <Link href="/dashboard/checklists"
          className="border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          ✅ Executar Checklist
        </Link>
      </div>
    </div>
  );
}
