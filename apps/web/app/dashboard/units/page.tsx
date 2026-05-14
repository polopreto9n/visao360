'use client';

import { useCallback, useEffect, useState } from 'react';
import { unitsApi, usersApi, Unit, User } from '../../../lib/api';
import { Modal } from '../../../components/ui/Modal';
import { canManage, getUser } from '../../../lib/auth';
import { api } from '../../../lib/api';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', GESTOR: 'Gestor', TECNICO: 'Técnico', CLIENTE: 'Cliente',
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  GESTOR: 'bg-blue-100 text-blue-700',
  TECNICO: 'bg-green-100 text-green-700',
  CLIENTE: 'bg-gray-100 text-gray-600',
};

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [assigning, setAssigning] = useState<Unit | null>(null);
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
            (u.code ?? '').toLowerCase().includes(search.toLowerCase()))
        : res.data.data;
      setUnits(filtered);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    usersApi.list({ limit: 100 }).then((r) => setUsers(r.data.data)).catch(() => {});
  }, []);

  async function handleRemoveUser(unit: Unit, userId: string) {
    if (!confirm('Remover responsável desta unidade?')) return;
    try {
      await unitsApi.removeUser(unit.id, userId);
      load();
    } catch { alert('Erro ao remover responsável'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Condomínios</h1>
          <p className="text-sm text-slate-500">{total} unidades cadastradas</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            + Novo Condomínio
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <input
          className="w-full max-w-md border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Buscar por nome ou código..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {units.length === 0 && (
            <div className="col-span-full bg-white rounded-xl border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-3">🏢</p>
              <p className="text-lg font-semibold text-slate-700">Nenhum condomínio encontrado</p>
            </div>
          )}
          {units.map((unit) => (
            <div key={unit.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">🏢</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{unit.name}</h3>
                    {unit.code && <p className="text-xs font-mono text-slate-400">{unit.code}</p>}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${unit.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {unit.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              {unit.address && (
                <p className="text-sm text-slate-500 line-clamp-1">📍 {unit.address}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>🏗️ {unit._count?.assets ?? 0} equipamentos</span>
                <span>📋 {unit._count?.checklists ?? 0} checklists</span>
                {(unit._count?.workOrders ?? 0) > 0 && (
                  <span>🔧 {unit._count?.workOrders} OS</span>
                )}
              </div>

              {/* Responsáveis */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600">👤 Responsáveis</p>
                  {canCreate && (
                    <button onClick={() => setAssigning(unit)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                      + Atribuir
                    </button>
                  )}
                </div>
                {(unit.users ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum responsável atribuído</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {unit.users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">{u.name[0]}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{u.name}</p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                          {canCreate && (
                            <button onClick={() => handleRemoveUser(unit, u.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors text-lg leading-none"
                              title="Remover">×</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {canCreate && (
                <button onClick={() => setEditing(unit)}
                  className="w-full border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-600 py-2 rounded-xl transition-colors">
                  ✏️ Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo Condomínio" size="md">
        <UnitForm onSuccess={() => { setCreating(false); load(); }} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Editar — ${editing?.name ?? ''}`} size="md">
        {editing && <UnitForm unit={editing} onSuccess={() => { setEditing(null); load(); }} />}
      </Modal>

      <Modal open={!!assigning} onClose={() => setAssigning(null)} title={`Atribuir responsável — ${assigning?.name ?? ''}`} size="md">
        {assigning && (
          <AssignUserForm unit={assigning} allUsers={users}
            onSuccess={() => { setAssigning(null); load(); }} />
        )}
      </Modal>
    </div>
  );
}

function UnitForm({ unit, onSuccess }: { unit?: Unit; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: unit?.name ?? '', code: unit?.code ?? '',
    address: unit?.address ?? '', description: unit?.description ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code || undefined, address: form.address || undefined,
        description: form.description || undefined,
      };
      if (unit) { await api.patch(`/units/${unit.id}`, payload); }
      else { await api.post('/units', payload); }
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  const f = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
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
          value={form.description} onChange={f('description')} placeholder="Informações adicionais..." />
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Salvando...' : unit ? 'Salvar alterações' : 'Criar Condomínio'}
      </button>
    </form>
  );
}

function AssignUserForm({ unit, allUsers, onSuccess }: {
  unit: Unit; allUsers: User[]; onSuccess: () => void;
}) {
  const assignedIds = new Set((unit.users ?? []).map((u) => u.id));
  const available = allUsers.filter((u) => !assignedIds.has(u.id) && u.isActive);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'TECNICO' });
  const [creating, setCreating] = useState(false);

  async function assignExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    try {
      await unitsApi.assignUser(unit.id, selectedId);
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao atribuir');
    } finally { setSaving(false); }
  }

  async function createAndAssign(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const userRes = await api.post<{ id: string }>('/auth/register', {
        name: newUser.name, email: newUser.email,
        password: newUser.password, role: newUser.role,
      });
      await unitsApi.assignUser(unit.id, userRes.data.id);
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao criar usuário');
    } finally { setCreating(false); }
  }

  const nu = (field: keyof typeof newUser) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setNewUser((p) => ({ ...p, [field]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(['existing', 'new'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-slate-500 hover:text-gray-700'}`}>
            {t === 'existing' ? '👤 Existente' : '➕ Criar novo'}
          </button>
        ))}
      </div>

      {tab === 'existing' ? (
        <form onSubmit={assignExisting} className="space-y-4">
          {available.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">Todos os usuários já estão atribuídos.</div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Usuário *</label>
                <select required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {ROLE_LABELS[u.role] ?? u.role}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={saving || !selectedId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                {saving ? 'Atribuindo...' : '✓ Atribuir como responsável'}
              </button>
            </>
          )}
        </form>
      ) : (
        <form onSubmit={createAndAssign} className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            Cria um novo usuário e já o atribui a este condomínio.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
            <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={newUser.name} onChange={nu('name')} placeholder="ex: João Silva" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">E-mail *</label>
            <input required type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={newUser.email} onChange={nu('email')} placeholder="joao@condominio.com.br" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Senha *</label>
              <input required type="password" minLength={6} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={newUser.password} onChange={nu('password')} placeholder="mín. 6 caracteres" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Função</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                value={newUser.role} onChange={nu('role')}>
                <option value="TECNICO">Técnico / Zelador</option>
                <option value="GESTOR">Gestor</option>
                <option value="CLIENTE">Cliente</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={creating}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
            {creating ? 'Criando...' : '✓ Criar e atribuir ao condomínio'}
          </button>
        </form>
      )}
    </div>
  );
}
