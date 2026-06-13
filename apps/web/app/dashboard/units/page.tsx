'use client';

import { useCallback, useEffect, useState } from 'react';
import { unitsApi, usersApi, reportsApi, Unit, User } from '../../../lib/api';
import { Modal } from '../../../components/ui/Modal';
import { canManage, getUser } from '../../../lib/auth';
import { api } from '../../../lib/api';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador', GESTOR: 'Gestor', TECNICO: 'Técnico', CLIENTE: 'Cliente',
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
  const [reporting, setReporting] = useState<Unit | null>(null);
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
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Condomínios</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} unidades cadastradas</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="fluent-button fluent-button-primary h-11 px-4 text-sm">
            + Novo Condomínio
          </button>
        )}
      </div>

      <div className="fluent-filter-bar">
        <input
          className="w-full max-w-md rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
            <div className="col-span-full rounded-xl border p-16 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-4xl mb-3">🏢</p>
              <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum condomínio encontrado</p>
            </div>
          )}
          {units.map((unit) => (
            <div key={unit.id} className="rounded-xl border hover:shadow-md transition-shadow p-5 flex flex-col gap-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">🏢</span>
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{unit.name}</h3>
                    {unit.code && <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{unit.code}</p>}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${unit.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {unit.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              {unit.address && (
                <p className="text-sm line-clamp-1" style={{ color: 'var(--text-muted)' }}>📍 {unit.address}</p>
              )}

              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>🏗️ {unit._count?.assets ?? 0} equipamentos</span>
                <span>📋 {unit._count?.checklists ?? 0} checklists</span>
                {(unit._count?.workOrders ?? 0) > 0 && (
                  <span>🔧 {unit._count?.workOrders} OS</span>
                )}
              </div>

              {/* Responsáveis */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>👤 Responsáveis</p>
                  {canCreate && (
                    <button onClick={() => setAssigning(unit)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                      + Atribuir
                    </button>
                  )}
                </div>
                {(unit.users ?? []).length === 0 ? (
                  <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Nenhum responsável atribuído</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {unit.users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5"
                        style={{ background: 'var(--surface-2)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">{u.name[0]}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
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

              <div className="flex gap-2">
                {canCreate && (
                  <button onClick={() => setEditing(unit)}
                    className="flex-1 border text-sm font-semibold py-2 rounded-xl transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    ✏️ Editar
                  </button>
                )}
                <button onClick={() => setReporting(unit)}
                  className="flex-1 border text-sm font-semibold py-2 rounded-xl transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  📄 Relatório
                </button>
              </div>
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

      <Modal open={!!reporting} onClose={() => setReporting(null)} title={`Relatório mensal — ${reporting?.name ?? ''}`} size="sm">
        {reporting && <MonthlyReportForm unit={reporting} onClose={() => setReporting(null)} />}
      </Modal>
    </div>
  );
}

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function MonthlyReportForm({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [downloading, setDownloading] = useState(false);

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await reportsApi.monthly(unit.id, month, year);
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-${unit.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${year}-${String(month).padStart(2, '0')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      alert('Erro ao gerar relatório');
    } finally { setDownloading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Mês</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle}
            value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_LABELS.map((label, i) => <option key={i} value={i + 1}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Ano</label>
          <input type="number" className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle}
            value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
      </div>
      <button onClick={handleDownload} disabled={downloading}
        className="fluent-button fluent-button-primary h-12 w-full text-sm">
        {downloading ? 'Gerando...' : '⬇ Baixar PDF'}
      </button>
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
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Nome *</label>
        <input required
          className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          value={form.name} onChange={f('name')} placeholder="ex: Condomínio Jardim das Flores" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Código</label>
          <input
            className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            value={form.code} onChange={f('code')} placeholder="ex: COND-003" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Endereço</label>
        <input
          className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          value={form.address} onChange={f('address')} placeholder="Rua, número, bairro, cidade" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Descrição</label>
        <textarea
          className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" rows={3}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          value={form.description} onChange={f('description')} placeholder="Informações adicionais..." />
      </div>
      <button type="submit" disabled={saving}
        className="fluent-button fluent-button-primary h-12 w-full text-sm">
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
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
        {(['existing', 'new'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={tab === t
              ? { background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)' }
              : { color: 'var(--text-muted)' }}>
            {t === 'existing' ? '👤 Existente' : '➕ Criar novo'}
          </button>
        ))}
      </div>

      {tab === 'existing' ? (
        <form onSubmit={assignExisting} className="space-y-4">
          {available.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>Todos os usuários já estão atribuídos.</div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Usuário *</label>
                <select required
                  className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
                className="fluent-button fluent-button-primary h-12 w-full text-sm">
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
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Nome *</label>
            <input required
              className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              value={newUser.name} onChange={nu('name')} placeholder="ex: João Silva" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>E-mail *</label>
            <input required type="email"
              className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              value={newUser.email} onChange={nu('email')} placeholder="joao@condominio.com.br" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Senha *</label>
              <input required type="password" minLength={6}
                className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                value={newUser.password} onChange={nu('password')} placeholder="mín. 6 caracteres" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Função</label>
              <select
                className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
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
