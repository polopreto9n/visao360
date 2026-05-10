'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { assetsApi, checklistsApi, workOrdersApi, Asset, Checklist, WorkOrder } from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { formatDate, formatDateTime, isOverdue } from '../../../../lib/auth';

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [assetRes, qrRes, clRes, woRes] = await Promise.allSettled([
        assetsApi.get(id),
        assetsApi.qrData(id),
        checklistsApi.list({ assetId: id, limit: 10 }),
        workOrdersApi.list({ limit: 5 }),
      ]);

      if (assetRes.status === 'fulfilled') setAsset(assetRes.value.data);
      if (qrRes.status === 'fulfilled') setQrDataUrl(qrRes.value.data.dataUrl);
      if (clRes.status === 'fulfilled') setChecklists(clRes.value.data.data);
      if (woRes.status === 'fulfilled') setWorkOrders(woRes.value.data.data.filter((w: WorkOrder) => w.asset?.id === id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!asset) return <div className="text-center py-20 text-slate-500">Equipamento não encontrado</div>;

  const maint = isOverdue(asset.nextMaintenanceAt) && asset.status === 'ACTIVE';

  const CATEGORY_ICONS: Record<string, string> = { Elevadores: '🛗', Elétrica: '⚡', Hidráulica: '💧', Segurança: '📹', HVAC: '❄️', Incêndio: '🔥' };
  const icon = CATEGORY_ICONS[asset.category] ?? '🏗️';

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
          {/* Info principal */}
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
              {asset.serialNumber && <div><p className="text-xs text-slate-400">Número de série</p><p className="font-semibold">{asset.serialNumber}</p></div>}
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

          {/* QR Code */}
          {qrDataUrl && (
            <div className="flex-shrink-0">
              <div className="bg-white border-2 border-slate-200 rounded-xl p-3 text-center">
                <img src={qrDataUrl} alt="QR Code" className="w-36 h-36" />
                <p className="text-xs text-slate-400 mt-2 font-mono">{asset.qrCode.substring(0, 16)}...</p>
                <a
                  href={qrDataUrl} download={`${asset.code ?? asset.id}-qr.png`}
                  className="mt-2 block text-xs text-blue-600 hover:underline"
                >⬇ Baixar QR Code</a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Checklists vinculados */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Checklists</h2>
            <Link href="/dashboard/checklists" className="text-xs text-blue-600 hover:underline">Ver todos →</Link>
          </div>
          {checklists.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum checklist vinculado</p>
          ) : (
            <div className="space-y-2">
              {checklists.map((cl) => (
                <div key={cl.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-lg">📋</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{cl.name}</p>
                    <p className="text-xs text-slate-500">{cl.items.length} itens · {cl.type}</p>
                  </div>
                  <Badge value={cl.type} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OS relacionadas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Ordens de Serviço</h2>
            <Link href={`/dashboard/work-orders`} className="text-xs text-blue-600 hover:underline">Ver todas →</Link>
          </div>
          {workOrders.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm text-slate-400">Nenhuma OS em aberto</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workOrders.map((wo) => (
                <Link key={wo.id} href={`/dashboard/work-orders/${wo.id}`}>
                  <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-400">{wo.code}</span>
                        <Badge value={wo.status} />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{wo.title}</p>
                    </div>
                    <Badge value={wo.priority} type="priority" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/work-orders" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          + Abrir OS para este equipamento
        </Link>
        <Link href="/dashboard/checklists" className="border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          ✅ Executar Checklist
        </Link>
      </div>
    </div>
  );
}
