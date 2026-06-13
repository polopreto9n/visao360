'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { assetsApi, unitsApi, Asset, Unit } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, isOverdue, canManage, getUser } from '../../../lib/auth';

const STATUS_FILTER = ['', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'];
const STATUS_LABELS_SHORT: Record<string, string> = {
  '': 'Todos', ACTIVE: 'Ativos', INACTIVE: 'Inativos',
  MAINTENANCE: 'Manutenção', DECOMMISSIONED: 'Desativados',
};

const CATEGORY_MARKS: Record<string, string> = {
  Elevadores: 'EL', Elétrica: 'EE', Hidráulica: 'HI', Segurança: 'SE',
  HVAC: 'HV', Incêndio: 'IN', Telecomunicações: 'TE',
};
function categoryMark(category: string) {
  return CATEGORY_MARKS[category] ?? category.slice(0, 2).toUpperCase();
}

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
  const [editing, setEditing] = useState<Asset | null>(null);
  const [maintaining, setMaintaining] = useState<Asset | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');
  const canDelete = user?.role === 'OWNER' || user?.role === 'ADMIN';

  async function handleDelete(asset: Asset) {
    if (!confirm(`Excluir o equipamento "${asset.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await assetsApi.remove(asset.id);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao excluir');
    }
  }

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
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Equipamentos</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} equipamentos</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/assets/recurring"
            className="fluent-button fluent-button-secondary h-11 px-4 text-sm">
            Problemas recorrentes
          </Link>
          {canCreate && (
            <button onClick={() => setCreating(true)}
              className="fluent-button fluent-button-primary h-11 px-4 text-sm"
            >
              + Novo Equipamento
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="fluent-filter-bar flex-col sm:flex-row">
        <input
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          placeholder="Buscar por nome, código ou marca..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          value={unitFilter} onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}>
          <option value="">Todas as unidades</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="flex gap-1">
          {STATUS_FILTER.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`fluent-filter-chip ${statusFilter === s ? 'fluent-filter-chip-active' : ''}`}>
              {STATUS_LABELS_SHORT[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de assets */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : assets.length === 0 ? (
        <div className="fluent-card p-16 text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum equipamento encontrado</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Ajuste os filtros ou cadastre um novo equipamento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const overdue = isOverdue(asset.nextMaintenanceAt) && asset.status === 'ACTIVE';
            return (
              <div
                key={asset.id}
                className="fluent-card flex flex-col p-4 sm:p-5"
                style={{
                  borderColor: overdue ? '#fcd34d' : 'var(--border)',
                }}
              >
                {/* Header do card */}
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-black"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {categoryMark(asset.category)}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{asset.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {asset.code && <span className="font-mono">{asset.code}</span>}
                        <span>{asset.category}</span>
                      </div>
                    </div>
                  </div>
                  <Badge value={asset.status} />
                </div>

                {/* Detalhes */}
                <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Unidade</strong>
                    {asset.unit.name}
                  </span>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Identificação</strong>
                    {[asset.brand, asset.model].filter(Boolean).join(' ') || 'Sem marca/modelo'}
                  </span>
                  {asset.nextMaintenanceAt && (
                    <span className="rounded-xl px-3 py-2 sm:col-span-2" style={{ background: overdue ? '#fef2f2' : 'var(--surface-2)' }}>
                      <strong className="block font-semibold" style={{ color: overdue ? '#dc2626' : 'var(--text-secondary)' }}>
                        {overdue ? 'Manutenção vencida' : 'Próxima manutenção'}
                      </strong>
                      <span style={{ color: overdue ? '#dc2626' : 'var(--text-muted)' }}>{formatDate(asset.nextMaintenanceAt)}</span>
                    </span>
                  )}
                </div>

                {/* Botão registrar manutenção — aparece quando vencida */}
                {overdue && canCreate && (
                  <button
                    onClick={() => setMaintaining(asset)}
                    className="fluent-button fluent-button-secondary mb-3 h-10 w-full justify-center px-3 text-xs text-emerald-700 hover:!border-emerald-200 hover:!bg-emerald-50"
                  >
                    Registrar manutenção
                  </button>
                )}

                {/* Ações */}
                <div className="mt-auto flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => openQR(asset)}
                    className="fluent-button fluent-button-secondary h-10 flex-1 px-3 text-xs text-blue-700"
                  >
                    QR Code
                  </button>
                  <button
                    onClick={() => downloadQR(asset)}
                    disabled={downloadingId === asset.id}
                    className="fluent-button fluent-button-ghost h-10 flex-1 px-3 text-xs"
                  >
                    {downloadingId === asset.id ? 'Gerando...' : 'Baixar PNG'}
                  </button>
                  {canCreate && (
                    <button
                      onClick={() => setEditing(asset)}
                      className="fluent-button fluent-button-ghost h-10 px-3 text-xs"
                      title="Editar equipamento"
                    >
                      Editar
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(asset)}
                      className="fluent-button fluent-button-ghost h-10 px-3 text-xs text-red-600 hover:!border-red-200 hover:!bg-red-50"
                      title="Excluir equipamento"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {total > 12 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Mostrando {(page - 1) * 12 + 1}–{Math.min(page * 12, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              ← Anterior
            </button>
            <button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal QR Code */}
      <Modal open={!!qrAsset} onClose={() => { setQrAsset(null); setQrDataUrl(''); }} title={`QR Code — ${qrAsset?.name}`} size="sm">
        {qrAsset && (
          <div className="text-center space-y-4">
            {qrLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : qrDataUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 rounded-xl inline-block" style={{ background: '#fff', border: '2px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                  <img src={qrDataUrl} alt={`QR Code ${qrAsset.name}`} className="w-52 h-52" />
                </div>
                <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{qrAsset.name}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{qrAsset.unit.name}</p>
                  <p className="font-mono text-xs px-3 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>{qrAsset.qrCode}</p>
                </div>
                <div className="flex gap-2 w-full">
                  <a
                    href={qrDataUrl} download={`${qrAsset.code ?? qrAsset.id}-qr.png`}
                    className="flex-1 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors text-center"
                    style={{ background: 'var(--accent)' }}
                  >
                    ⬇ Baixar PNG
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(qrAsset.qrCode); }}
                    className="flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--surface)' }}
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

      {/* Modal de edição */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar — ${editing?.name ?? ''}`} size="lg">
        {editing && (
          <CreateAssetForm
            units={units}
            asset={editing}
            onSuccess={() => { setEditing(null); load(); }}
          />
        )}
      </Modal>

      {/* Modal registrar manutenção */}
      <Modal open={!!maintaining} onClose={() => setMaintaining(null)} title={`✓ Registrar Manutenção — ${maintaining?.name ?? ''}`} size="sm">
        {maintaining && (
          <RegisterMaintenanceForm
            asset={maintaining}
            onSuccess={() => { setMaintaining(null); load(); }}
          />
        )}
      </Modal>
    </div>
  );
}

function RegisterMaintenanceForm({ asset, onSuccess }: { asset: Asset; onSuccess: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [nextDate, setNextDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nextDate) { alert('Informe a data da próxima manutenção'); return; }
    setSaving(true);
    try {
      await assetsApi.update(asset.id, {
        lastMaintenanceAt: new Date().toISOString(),
        nextMaintenanceAt: new Date(nextDate + 'T12:00:00').toISOString(),
        status: 'ACTIVE',
        ...(notes ? { description: notes } : {}),
      });
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao registrar');
    } finally { setSaving(false); }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-semibold">Manutenção realizada hoje ({new Date().toLocaleDateString('pt-BR')})</p>
        <p className="text-xs mt-0.5 text-green-600">O campo "Última manutenção" será atualizado automaticamente.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Próxima manutenção *</label>
        <input
          required type="date"
          min={today}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={inputStyle}
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Defina quando deve ser feita a próxima manutenção.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Observações (opcional)</label>
        <textarea
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          style={inputStyle}
          placeholder="O que foi feito, peças trocadas, empresa responsável..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Salvando...' : '✓ Confirmar Manutenção'}
      </button>
    </form>
  );
}

function CreateAssetForm({ units, asset, onSuccess }: { units: Unit[]; asset?: Asset; onSuccess: () => void }) {
  const isEditing = !!asset;
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    unitId: asset?.unit?.id ?? '',
    category: asset?.category ?? '',
    brand: asset?.brand ?? '',
    model: asset?.model ?? '',
    serialNumber: asset?.serialNumber ?? '',
    code: asset?.code ?? '',
    description: asset?.description ?? '',
    nextMaintenanceAt: asset?.nextMaintenanceAt ? new Date(asset.nextMaintenanceAt).toISOString().split('T')[0] : '',
    warrantyUntil: asset?.warrantyUntil ? new Date(asset.warrantyUntil).toISOString().split('T')[0] : '',
    contractUntil: asset?.contractUntil ? new Date(asset.contractUntil).toISOString().split('T')[0] : '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        brand: form.brand || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        code: form.code || undefined,
        description: form.description || undefined,
        nextMaintenanceAt: form.nextMaintenanceAt ? new Date(form.nextMaintenanceAt + 'T12:00:00').toISOString() : undefined,
        warrantyUntil: form.warrantyUntil ? new Date(form.warrantyUntil + 'T12:00:00').toISOString() : undefined,
        contractUntil: form.contractUntil ? new Date(form.contractUntil + 'T12:00:00').toISOString() : undefined,
      };
      if (isEditing && asset) {
        await assetsApi.update(asset.id, payload);
      } else {
        await assetsApi.create(payload);
      }
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar equipamento');
    } finally { setSaving(false); }
  }

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Nome do equipamento *</label>
          <input required className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.name} onChange={f('name')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Unidade *</label>
          <select required className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.unitId} onChange={f('unitId')}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Categoria *</label>
          <input required className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.category} onChange={f('category')} placeholder="ex: Elevadores" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Código interno</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.code} onChange={f('code')} placeholder="ex: ELV-003" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Marca</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.brand} onChange={f('brand')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Modelo</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.model} onChange={f('model')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Número de série</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.serialNumber} onChange={f('serialNumber')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Próxima manutenção</label>
          <input type="date" className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.nextMaintenanceAt} onChange={f('nextMaintenanceAt')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Garantia até</label>
          <input type="date" className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.warrantyUntil} onChange={f('warrantyUntil')} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Contrato de manutenção até</label>
          <input type="date" className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle} value={form.contractUntil} onChange={f('contractUntil')} />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="fluent-button fluent-button-primary h-12 w-full text-sm">
        {saving ? 'Salvando...' : isEditing ? '✓ Salvar alterações' : 'Cadastrar Equipamento'}
      </button>
    </form>
  );
}
