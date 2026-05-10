'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { workOrdersApi, usersApi, WorkOrder, User } from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { Modal } from '../../../../components/ui/Modal';
import {
  formatDate, formatDateTime, isOverdue, canManage, canAdmin, getUser,
  PRIORITY_LABELS, STATUS_LABELS,
} from '../../../../lib/auth';

const TRANSITIONS: Record<string, { status: string; label: string; color: string }[]> = {
  OPEN: [{ status: 'ASSIGNED', label: 'Atribuir técnico', color: 'purple' }, { status: 'CANCELLED', label: 'Cancelar', color: 'red' }],
  ASSIGNED: [{ status: 'IN_PROGRESS', label: 'Iniciar atendimento', color: 'amber' }, { status: 'CANCELLED', label: 'Cancelar', color: 'red' }],
  IN_PROGRESS: [
    { status: 'WAITING_PARTS', label: 'Aguardar peças', color: 'orange' },
    { status: 'COMPLETED', label: '✓ Concluir OS', color: 'green' },
    { status: 'CANCELLED', label: 'Cancelar', color: 'red' },
  ],
  WAITING_PARTS: [{ status: 'IN_PROGRESS', label: 'Retomar', color: 'amber' }],
};

const BTN = {
  purple: 'bg-purple-600 hover:bg-purple-700 text-white',
  amber: 'bg-amber-500 hover:bg-amber-600 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 text-white',
  green: 'bg-green-600 hover:bg-green-700 text-white',
  red: 'bg-red-100 hover:bg-red-200 text-red-700 border border-red-200',
} as const;

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [techModal, setTechModal] = useState(false);
  const [statusModal, setStatusModal] = useState<{ status: string; label: string } | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const user = getUser();

  const load = useCallback(async () => {
    try {
      const res = await workOrdersApi.get(id);
      setWo(res.data);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canManage(user?.role ?? '')) {
      usersApi.list({ limit: 100 }).then((r) => setUsers(r.data.data)).catch(() => {});
    }
  }, [user?.role]);

  async function handleStatusChange(status: string) {
    if (!wo) return;
    setSaving(true);
    try {
      const res = await workOrdersApi.updateStatus(wo.id, status, statusNote || undefined);
      setWo(res.data);
      setStatusModal(null);
      setStatusNote('');
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro');
    } finally { setSaving(false); }
  }

  async function handleAssign(assigneeId: string) {
    if (!wo) return;
    setSaving(true);
    try {
      const res = await workOrdersApi.assign(wo.id, assigneeId);
      setWo(res.data);
      setTechModal(false);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!wo) return <div className="text-center py-20 text-slate-500">OS não encontrada</div>;

  const overdue = isOverdue(wo.dueDate) && !['COMPLETED', 'CANCELLED'].includes(wo.status);
  const transitions = TRANSITIONS[wo.status] ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard/work-orders" className="hover:text-blue-600">Ordens de Serviço</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{wo.code}</span>
      </div>

      {/* Header */}
      <div className={`bg-white rounded-xl border p-6 shadow-sm ${overdue ? 'border-red-200 bg-red-50/20' : 'border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-mono text-sm text-slate-400">{wo.code}</span>
              <Badge value={wo.status} />
              <Badge value={wo.priority} type="priority" />
              {overdue && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠️ VENCIDA</span>}
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900">{wo.title}</h1>
            <p className="text-slate-600 mt-2 leading-relaxed">{wo.description}</p>
          </div>

          {/* Ações de status */}
          {transitions.length > 0 && (
            <div className="flex flex-col gap-2 min-w-[180px]">
              {transitions.map((t) => (
                <button
                  key={t.status}
                  onClick={() => setStatusModal(t)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${BTN[t.color as keyof typeof BTN]}`}
                >
                  {t.label}
                </button>
              ))}
              {canManage(user?.role ?? '') && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED' && (
                <button
                  onClick={() => setTechModal(true)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  👤 Reatribuir
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-4">Timeline</h2>
            <div className="space-y-3">
              {[
                { label: 'Criada', date: wo.creator?.name ? `por ${wo.creator.name}` : undefined, value: formatDateTime(wo.unit?.name ? null : null), ts: wo.unit?.name },
                { label: 'Atribuída', date: wo.assignee?.name, value: null, ts: null },
                { label: 'Iniciada', date: null, value: null, ts: wo.startedAt },
                { label: 'Concluída', date: null, value: null, ts: wo.completedAt },
              ].filter((t) => t.ts || t.date).map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    {item.date && <p className="text-xs text-slate-500">{item.date}</p>}
                    {item.ts && <p className="text-xs text-slate-400">{formatDateTime(item.ts)}</p>}
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                <div><p className="text-sm font-semibold text-gray-900">Criada</p>
                  <p className="text-xs text-slate-500">por {wo.creator.name}</p></div>
              </div>
              {wo.assignee && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                  <div><p className="text-sm font-semibold text-gray-900">Atribuída</p>
                    <p className="text-xs text-slate-500">para {wo.assignee.name}</p></div>
                </div>
              )}
              {wo.startedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                  <div><p className="text-sm font-semibold text-gray-900">Iniciada</p>
                    <p className="text-xs text-slate-400">{formatDateTime(wo.startedAt)}</p></div>
                </div>
              )}
              {wo.completedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                  <div><p className="text-sm font-semibold text-gray-900">Concluída</p>
                    <p className="text-xs text-slate-400">{formatDateTime(wo.completedAt)}</p></div>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          {wo.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h2 className="font-bold text-gray-900 mb-2">📝 Observações</h2>
              <p className="text-sm text-slate-700 leading-relaxed">{wo.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar de info */}
        <div className="space-y-4">
          <InfoCard title="Detalhes">
            <InfoRow label="Prioridade" value={<Badge value={wo.priority} type="priority" />} />
            <InfoRow label="Status" value={<Badge value={wo.status} />} />
            <InfoRow label="Prazo" value={
              wo.dueDate
                ? <span className={overdue ? 'text-red-600 font-semibold' : ''}>{formatDate(wo.dueDate)}</span>
                : '—'
            } />
            <InfoRow label="Unidade" value={wo.unit.name} />
            {wo.asset && <InfoRow label="Equipamento" value={
              <Link href={`/dashboard/assets/${wo.asset.id}`} className="text-blue-600 hover:underline text-sm">
                {wo.asset.name}
              </Link>
            } />}
          </InfoCard>

          <InfoCard title="Pessoas">
            <InfoRow label="Criador" value={wo.creator.name} />
            <InfoRow label="Técnico" value={
              wo.assignee
                ? wo.assignee.name
                : <span className="text-slate-400 text-sm">Não atribuído</span>
            } />
          </InfoCard>
        </div>
      </div>

      {/* Modal atualizar status */}
      <Modal open={!!statusModal} onClose={() => setStatusModal(null)} title={statusModal?.label ?? ''} size="sm">
        {statusModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Deseja {statusModal.label.toLowerCase()} esta OS?</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observação (opcional)</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" rows={3}
                value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Informe detalhes..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStatusModal(null)} className="flex-1 border border-slate-200 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleStatusChange(statusModal.status)} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold">
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal reatribuir técnico */}
      <Modal open={techModal} onClose={() => setTechModal(false)} title="Atribuir Técnico" size="sm">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {users.filter((u) => u.role === 'TECNICO' || u.role === 'GESTOR').map((u) => (
            <button key={u.id} onClick={() => handleAssign(u.id)} disabled={saving}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-blue-50 transition-colors border ${wo.assignee?.id === u.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100'}`}>
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-700 text-sm">{u.name.charAt(0)}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{u.name}</p>
                <p className="text-xs text-slate-400">{u.role}</p>
              </div>
              {wo.assignee?.id === u.id && <span className="ml-auto text-blue-600 text-xs font-bold">Atual</span>}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
