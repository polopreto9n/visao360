'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { workOrdersApi, unitsApi, usersApi, WorkOrder, Unit, User } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDate, isOverdue, getUser, canManage } from '../../../lib/auth';

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
  const [units, setUnits] = useState<Unit[]>([]);
  const [techUsers, setTechUsers] = useState<User[]>([]);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');

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
          <h1 className="text-2xl font-extrabold text-gray-900">Ordens de Serviço</h1>
          <p className="text-sm text-slate-500">{total} OS encontradas</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            + Nova OS
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          placeholder="Buscar por código ou título..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-3">🔧</p>
          <p className="text-lg font-semibold text-slate-700">Nenhuma OS encontrada</p>
          <p className="text-sm text-slate-400 mt-1">Tente ajustar os filtros ou criar uma nova OS</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((wo) => {
            const overdue = isOverdue(wo.dueDate) && !['COMPLETED', 'CANCELLED'].includes(wo.status);
            const transitions = TRANSITIONS[wo.status] ?? [];
            return (
              <div key={wo.id} className={`bg-white rounded-xl border shadow-sm p-5 ${overdue ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-slate-400">{wo.code}</span>
                      <Badge value={wo.status} />
                      <Badge value={wo.priority} type="priority" />
                      {overdue && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">VENCIDA</span>}
                    </div>
                    <Link href={`/dashboard/work-orders/${wo.id}`}>
                      <h3 className="text-base font-bold text-gray-900 hover:text-blue-700 transition-colors">{wo.title}</h3>
                    </Link>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{wo.description}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                      <span>🏢 {wo.unit.name}</span>
                      {wo.asset && <span>🏗️ {wo.asset.name}</span>}
                      {wo.assignee && <span>👤 {wo.assignee.name}</span>}
                      {wo.dueDate && <span className={overdue ? 'text-red-600 font-semibold' : ''}>📅 {formatDate(wo.dueDate)}</span>}
                    </div>
                  </div>

                  {/* Ações */}
                  {transitions.length > 0 && (
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
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {total > 15 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Mostrando {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} de {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">← Anterior</button>
            <button disabled={page * 15 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40">Próxima →</button>
          </div>
        </div>
      )}

      {/* Modal de atualização de status */}
      <Modal open={!!updating} onClose={() => { setUpdating(null); setStatusNote(''); }} title={`Atualizar OS ${updating?.code}`} size="sm">
        {updating && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Selecione o novo status para a OS:</p>
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observação (opcional)</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                rows={3} placeholder="Informe detalhes sobre a atualização..."
                value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
              />
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Título *</label>
        <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição *</label>
        <textarea required rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade *</label>
          <select required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            value={form.unitId} onChange={(e) => setForm(f => ({ ...f, unitId: e.target.value }))}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Prioridade</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Técnico responsável</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            value={form.assigneeId} onChange={(e) => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
            <option value="">Não atribuído</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Prazo</label>
          <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Criando...' : 'Criar Ordem de Serviço'}
      </button>
    </form>
  );
}
