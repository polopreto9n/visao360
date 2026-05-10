'use client';

import { useCallback, useEffect, useState } from 'react';
import { unitsApi, Unit } from '../../../lib/api';
import { Modal } from '../../../components/ui/Modal';
import { canManage, getUser } from '../../../lib/auth';
import { api } from '../../../lib/api';

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [search, setSearch] = useState('');
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await unitsApi.list();
      const filtered = search
        ? res.data.data.filter((u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            (u.code ?? '').toLowerCase().includes(search.toLowerCase()),
          )
        : res.data.data;
      setUnits(filtered);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Unidades</h1>
          <p className="text-sm text-slate-500">{total} unidades cadastradas</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            + Nova Unidade
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <input
          className="w-full max-w-md border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Buscar por nome ou código..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {units.length === 0 && (
            <div className="col-span-full bg-white rounded-xl border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-3">🏢</p>
              <p className="text-lg font-semibold text-slate-700">Nenhuma unidade encontrada</p>
            </div>
          )}
          {units.map((unit) => (
            <div key={unit.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">🏢</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{unit.name}</h3>
                    {unit.code && <p className="text-xs font-mono text-slate-400">{unit.code}</p>}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${unit.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {unit.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              {unit.address && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">📍 {unit.address}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                <span>🏗️ {unit._count?.assets ?? 0} equipamentos</span>
                <span>📋 {unit._count?.checklists ?? 0} checklists</span>
              </div>

              {canCreate && (
                <button
                  onClick={() => setEditing(unit)}
                  className="w-full border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-600 py-2 rounded-xl transition-colors"
                >
                  ✏️ Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nova Unidade" size="md">
        <UnitForm onSuccess={() => { setCreating(false); load(); }} />
      </Modal>

      {/* Modal editar */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar Unidade" size="md">
        {editing && <UnitForm unit={editing} onSuccess={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}

function UnitForm({ unit, onSuccess }: { unit?: Unit; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: unit?.name ?? '',
    code: unit?.code ?? '',
    address: unit?.address ?? '',
    description: unit?.description ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (unit) {
        await api.patch(`/units/${unit.id}`, {
          ...form,
          code: form.code || undefined,
          address: form.address || undefined,
          description: form.description || undefined,
        });
      } else {
        await api.post('/units', {
          ...form,
          code: form.code || undefined,
          address: form.address || undefined,
          description: form.description || undefined,
        });
      }
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nome da unidade *</label>
        <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.name} onChange={f('name')} placeholder="ex: Condomínio Jardim das Flores" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Código</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.code} onChange={f('code')} placeholder="ex: COND-003" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Endereço</label>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.address} onChange={f('address')} placeholder="Rua, número, bairro, cidade" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição</label>
        <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" rows={3}
          value={form.description} onChange={f('description')} placeholder="Informações adicionais sobre a unidade..." />
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Salvando...' : unit ? 'Salvar alterações' : 'Criar Unidade'}
      </button>
    </form>
  );
}
