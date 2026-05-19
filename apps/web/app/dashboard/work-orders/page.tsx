'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { workOrdersApi, unitsApi, usersApi, WorkOrder, Unit, User } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, isOverdue, getUser, canManage, canAdmin } from '../../../lib/auth';

const STATUS_TABS = [
  { key: '', label: 'Todas' },
  { key: 'OPEN', label: 'Abertas' },
  { key: 'ASSIGNED', label: 'Atribuídas' },
  { key: 'IN_PROGRESS', label: 'Em andamento' },
  { key: 'WAITING_PARTS', label: 'Aguard. peças' },
  { key: 'COMPLETED', label: 'Concluídas' },
];

const TRANSITIONS: Record<string, { status: string; label: string; color: string }[]> = {
  OPEN: [{ status: 'ASSIGNED', label: 'Atribuir', color: 'purple' }, { status: 'CANCELLED', label: 'Cancelar', color: 'red' }],
  ASSIGNED: [{ status: 'IN_PROGRESS', label: 'Iniciar', color: 'amber' }, { status: 'CANCELLED', label: 'Cancelar', color: 'red' }],
  IN_PROGRESS: [
    { status: 'WAITING_PARTS', label: 'Aguard. peças', color: 'orange' },
    { status: 'COMPLETED', label: 'Concluir', color: 'green' },
    { status: 'CANCELLED', label: 'Cancelar', color: 'red' },
  ],
  WAITING_PARTS: [{ status: 'IN_PROGRESS', label: 'Retomar', color: 'amber' }, { status: 'CANCELLED', label: 'Cancelar', color: 'red' }],
};

const BTN_COLORS: Record<string, string> = {
  purple: 'bg-purple-600 hover:bg-purple-700 text-white',
  amber: 'bg-amber-500 hover:bg-amber-600 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 text-white',
  green: 'bg-green-600 hover:bg-green-700 text-white',
  red: 'bg-red-600 hover:bg-red-700 text-white',
};

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<WorkOrder | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [deleting, setDeleting] = useState<WorkOrder | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [techUsers, setTechUsers] = useState<User[]>([]);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');
  const isAdmin = canAdmin(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 15 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await workOrdersApi.list(params);
      setOrders(res.data.data);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canCreate) {
      Promise.all([unitsApi.list(), usersApi.list({ limit: 100 })]).then(([u, us]) => {
        setUnits(u.data.data);
        setTechUsers(us.data.data.filter((u) => u.role === 'TECNICO' || u.role === 'GESTOR'));
      }).catch(() => {});
    }
  }, [canCreate]);

  async function handleDelete(wo: WorkOrder) {
    setDeleteLoading(true);
    try {
      await workOrdersApi.delete(wo.id);
      setDeleting(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao excluir OS');
    } finally { setDeleteLoading(false); }
  }

  async function handleUpdateStatus(wo: WorkOrder, status: string) {
    try {
      await workOrdersApi.updateStatus(wo.id, status, statusNote || undefined);
      setUpdating(null);
      setStatusNote('');
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao atualizar OS');
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Ordens de Serviço</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} OS encontradas</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreating(true)}
            className="text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            + Nova OS
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border p-4 flex flex-col sm:flex-row gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <input
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          placeholder="Buscar por código ou título..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
              style={
                statusFilter === tab.key
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--surface-2)', color: 'var(--text-secondary)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border p-16 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <p className="text-4xl mb-3">🔧</p>
          <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhuma OS encontrada</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Tente ajustar os filtros ou criar uma nova OS</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((wo) => {
            const overdue = isOverdue(wo.dueDate) && !['COMPLETED', 'CANCELLED'].includes(wo.status);
            const transitions = TRANSITIONS[wo.status] ?? [];
            return (
              <div
                key={wo.id}
                className="rounded-xl border p-5"
                style={{
                  background: overdue ? 'color-mix(in srgb, var(--surface) 95%, #ef4444 5%)' : 'var(--surface)',
                  borderColor: overdue ? '#fca5a5' : 'var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{wo.code}</span>
                      <Badge value={wo.status} />
                      <Badge value={wo.priority} type="priority" />
                      {overdue && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">VENCIDA</span>}
                    </div>
                    <Link href={`/dashboard/work-orders/${wo.id}`}>
                      <h3 className="text-base font-bold transition-colors hover:text-blue-600" style={{ color: 'var(--text-primary)' }}>{wo.title}</h3>
                    </Link>
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{wo.description}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>🏢 {wo.unit.name}</span>
                      {wo.asset && <span>🏗️ {wo.asset.name}</span>}
                      {wo.assignee && <span>👤 {wo.assignee.name}</span>}
                      {wo.dueDate && (
                        <span style={{ color: overdue ? '#dc2626' : 'var(--text-secondary)', fontWeight: overdue ? 600 : undefined }}>
                          📅 {formatDate(wo.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    {transitions.map((t) => (
                      <button
                        key={t.status}
                        onClick={() => { setUpdating(wo); }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${BTN_COLORS[t.color]}`}
                      >
                        {t.label}
                      </button>
                    ))}
                    {isAdmin && (
                      <button
                        onClick={() => setDeleting(wo)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:bg-red-100 hover:text-red-700"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                        title="Excluir OS"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {total > 15 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>Mostrando {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              ← Anterior
            </button>
            <button disabled={page * 15 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
              Próxima →
            </button>
          </div>
        </div>
      )}

      {/* Modal de atualização de status */}
      <Modal open={!!updating} onClose={() => { setUpdating(null); setStatusNote(''); }} title={`Atualizar OS ${updating?.code}`} size="sm">
        {updating && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Selecione o novo status para a OS:</p>
            <div className="flex flex-col gap-2">
              {(TRANSITIONS[updating.status] ?? []).map((t) => (
                <button
                  key={t.status}
                  onClick={() => handleUpdateStatus(updating, t.status)}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${BTN_COLORS[t.color]}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Observação (opcional)</label>
              <textarea
                className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                rows={3} placeholder="Informe detalhes sobre a atualização..."
                value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Excluir Ordem de Serviço" size="sm">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Tem certeza que deseja excluir permanentemente a OS <strong>{deleting.code}</strong>?
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{deleting.title}</p>
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--surface)' }}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleting)} disabled={deleteLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                {deleteLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de criação */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nova Ordem de Serviço" size="lg">
        <CreateWOForm units={units} users={techUsers} onSuccess={() => { setCreating(false); load(); }} />
      </Modal>
    </div>
  );
}

function CreateWOForm({ units, users, onSuccess }: { units: Unit[]; users: User[]; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', unitId: '', priority: 'MEDIUM', assigneeId: '', dueDate: '' });
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<WorkOrder[]>([]);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Busca últimas OS da unidade selecionada para sugestão
  useEffect(() => {
    if (!form.unitId || suggestionDismissed) { setSuggestions([]); return; }
    workOrdersApi.list({ unitId: form.unitId, limit: 3, status: 'COMPLETED' })
      .then((r) => setSuggestions(r.data.data.slice(0, 3)))
      .catch(() => setSuggestions([]));
  }, [form.unitId, suggestionDismissed]);

  function applySuggestion(wo: WorkOrder) {
    setForm(f => ({ ...f, title: wo.title, description: wo.description, priority: wo.priority }));
    setSuggestions([]);
    setSuggestionDismissed(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await workOrdersApi.create({
        ...form,
        assigneeId: form.assigneeId || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao criar OS');
    } finally { setSaving(false); }
  }

  const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Unidade *</label>
          <select required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.unitId} onChange={(e) => { setForm(f => ({ ...f, unitId: e.target.value })); setSuggestionDismissed(false); }}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Prioridade</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sugestões baseadas no histórico da unidade */}
      {suggestions.length > 0 && !form.title && (
        <div className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--accent-soft)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>💡 Baseado no histórico desta unidade:</p>
            <button type="button" onClick={() => setSuggestionDismissed(true)}
              className="text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
          </div>
          {suggestions.map((wo) => (
            <button key={wo.id} type="button" onClick={() => applySuggestion(wo)}
              className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg transition-colors group"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="text-base flex-shrink-0">🔧</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{wo.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Prioridade {PRIORITY_LABELS[wo.priority]}</p>
              </div>
              <span className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: 'var(--accent)' }}>Usar →</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Título *</label>
        <input required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Descreva brevemente o problema ou serviço..." />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Descrição *</label>
        <textarea required rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Detalhes do serviço, local exato, equipamentos envolvidos..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Técnico responsável</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.assigneeId} onChange={(e) => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
            <option value="">Não atribuído</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Prazo</label>
          <input type="date" className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="w-full disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        style={{ background: 'var(--accent)' }}>
        {saving ? 'Criando...' : 'Criar Ordem de Serviço'}
      </button>
    </form>
  );
}
