'use client';

import { useCallback, useEffect, useState } from 'react';
import { assetsApi, unitsApi, Asset, Unit } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, isOverdue, canManage, getUser } from '../../../lib/auth';

const STATUS_FILTER = ['', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'];
const STATUS_LABELS_SHORT: Record<string, string> = {
  '': 'Todos', ACTIVE: 'Ativos', INACTIVE: 'Inativos',
  MAINTENANCE: 'Manutenção', DECOMMISSIONED: 'Desativados',
};

const CATEGORY_ICONS: Record<string, string> = {
  Elevadores: '🛗', Elétrica: '⚡', Hidráulica: '💧', Segurança: '📹',
  HVAC: '❄️', Incêndio: '🔥', Telecomunicações: '📡',
};
function catIcon(cat: string) { return CATEGORY_ICONS[cat] ?? '🏗️'; }

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');

  /** Baixa o QR Code como PNG usando a data URL base64 (evita problema de auth) */
  async function downloadQR(asset: Asset) {
    setDownloadingId(asset.id);
    try {
      const res = await assetsApi.qrData(asset.id);
      const link = document.createElement('a');
      link.href = res.data.dataUrl;
      link.download = `${asset.code ?? asset.id}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Erro ao gerar QR Code. Tente novamente.');
    } finally {
      setDownloadingId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 12 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (unitFilter) params.unitId = unitFilter;
      const res = await assetsApi.list(params);
      setAssets(res.data.data);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [page, search, statusFilter, unitFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    unitsApi.list().then((r) => setUnits(r.data.data)).catch(() => {});
  }, []);

  async function openQR(asset: Asset) {
    setQrAsset(asset);
    setQrLoading(true);
    try {
      const res = await assetsApi.qrData(asset.id);
      setQrDataUrl(res.data.dataUrl);
    } catch { setQrDataUrl(''); }
    finally { setQrLoading(false); }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Equipamentos</h1>
          <p className="text-sm text-slate-500">{total} equipamentos</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            + Novo Equipamento
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Buscar por nome, código ou marca..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          value={unitFilter} onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="flex gap-1">
          {STATUS_FILTER.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {STATUS_LABELS_SHORT[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de assets */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-3">🏗️</p>
          <p className="text-lg font-semibold text-slate-700">Nenhum equipamento encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const overdue = isOverdue(asset.nextMaintenanceAt) && asset.status === 'ACTIVE';
            return (
              <div key={asset.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-5 ${overdue ? 'border-amber-200' : 'border-slate-200'}`}>
                {/* Header do card */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{catIcon(asset.category)}</span>
                    <div>
                      <p className="font-bold text-gray-900 leading-tight">{asset.name}</p>
                      {asset.code && <p className="text-xs text-slate-400 font-mono">{asset.code}</p>}
                    </div>
                  </div>
                  <Badge value={asset.status} />
                </div>

                {/* Detalhes */}
                <div className="space-y-1.5 text-sm text-slate-600 mb-4">
                  <p>🏢 {asset.unit.name}</p>
                  <p>🏷️ {asset.category}{asset.brand ? ` · ${asset.brand}` : ''}{asset.model ? ` ${asset.model}` : ''}</p>
                  {asset.nextMaintenanceAt && (
                    <p className={overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                      🔧 {overdue ? '⚠️ VENCIDA — ' : 'Prox. manutenção: '}
                      {formatDate(asset.nextMaintenanceAt)}
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <button
                    onClick={() => openQR(asset)}
                    className="flex-1 flex items-center justify-center gap-2 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold py-2 rounded-xl transition-colors"
                  >
                    <span>⬛</span> QR Code
                  </button>
                  <button
                    onClick={() => downloadQR(asset)}
                    disabled={downloadingId === asset.id}
                    className="flex-1 flex items-center justify-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold py-2 rounded-xl transition-colors disabled:opacity-60"
                  >
                    {downloadingId === asset.id ? '⏳ Gerando...' : '⬇ Baixar PNG'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {total > 12 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Mostrando {(page - 1) * 12 + 1}–{Math.min(page * 12, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
            <button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
          </div>
        </div>
      )}

      {/* Modal QR Code */}
      <Modal open={!!qrAsset} onClose={() => { setQrAsset(null); setQrDataUrl(''); }} title={`QR Code — ${qrAsset?.name}`} size="sm">
        {qrAsset && (
          <div className="text-center space-y-4">
            {qrLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : qrDataUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-3 rounded-xl border-2 border-slate-200 shadow-sm inline-block">
                  <img src={qrDataUrl} alt={`QR Code ${qrAsset.name}`} className="w-52 h-52" />
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p className="font-semibold text-gray-900">{qrAsset.name}</p>
                  <p className="text-slate-500">{qrAsset.unit.name}</p>
                  <p className="font-mono text-xs bg-slate-100 px-3 py-1 rounded-lg">{qrAsset.qrCode}</p>
                </div>
                <div className="flex gap-2 w-full">
                  <a
                    href={qrDataUrl} download={`${qrAsset.code ?? qrAsset.id}-qr.png`}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors text-center"
                  >
                    ⬇ Baixar PNG
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(qrAsset.qrCode); }}
                    className="flex-1 border border-slate-200 hover:bg-slate-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    📋 Copiar código
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-500 py-8">Erro ao gerar QR Code</p>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de criação */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo Equipamento" size="lg">
        <CreateAssetForm units={units} onSuccess={() => { setCreating(false); load(); }} />
      </Modal>
    </div>
  );
}

function CreateAssetForm({ units, onSuccess }: { units: Unit[]; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', unitId: '', category: '', brand: '', model: '',
    serialNumber: '', code: '', description: '', nextMaintenanceAt: '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await assetsApi.create({
        ...form,
        brand: form.brand || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        code: form.code || undefined,
        description: form.description || undefined,
        nextMaintenanceAt: form.nextMaintenanceAt ? new Date(form.nextMaintenanceAt).toISOString() : undefined,
      });
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao criar equipamento');
    } finally { setSaving(false); }
  }

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do equipamento *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade *</label>
          <select required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" value={form.unitId} onChange={f('unitId')}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.category} onChange={f('category')} placeholder="ex: Elevadores" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Código interno</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.code} onChange={f('code')} placeholder="ex: ELV-003" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Marca</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.brand} onChange={f('brand')} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Modelo</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.model} onChange={f('model')} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Número de série</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.serialNumber} onChange={f('serialNumber')} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Próxima manutenção</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.nextMaintenanceAt} onChange={f('nextMaintenanceAt')} />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Cadastrando...' : 'Cadastrar Equipamento'}
      </button>
    </form>
  );
}
