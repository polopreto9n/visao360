'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { workOrdersApi, usersApi, WorkOrder, User } from '../../../../lib/api';
import { Badge } from '../../../../components/ui/Badge';
import { Modal } from '../../../../components/ui/Modal';
import {
  formatDate, formatDateTime, isOverdue, canManage, getUser, ROLE_LABELS,
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
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [techModal, setTechModal] = useState(false);
  const [statusModal, setStatusModal] = useState<{ status: string; label: string } | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [statusCost, setStatusCost] = useState('');
  const [statusMaterials, setStatusMaterials] = useState('');
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
      const cost = statusCost ? Number(statusCost.replace(',', '.')) : undefined;
      const res = await workOrdersApi.updateStatus(wo.id, status, statusNote || undefined, {
        cost: cost && !Number.isNaN(cost) ? cost : undefined,
        materialsUsed: statusMaterials || undefined,
      });
      setWo(res.data);
      setStatusModal(null);
      setStatusNote('');
      setStatusCost('');
      setStatusMaterials('');
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
  if (!wo) return <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>OS não encontrada</div>;

  const overdue = isOverdue(wo.dueDate) && !['COMPLETED', 'CANCELLED'].includes(wo.status);
  const transitions = TRANSITIONS[wo.status] ?? [];
  const timelineItems = [
    {
      label: 'Criada',
      detail: `por ${wo.creator.name}`,
      timestamp: wo.createdAt,
      tone: 'bg-blue-600',
    },
    wo.assignee ? {
      label: 'Atribuída',
      detail: `para ${wo.assignee.name}`,
      timestamp: null,
      tone: 'bg-purple-500',
    } : null,
    wo.startedAt ? {
      label: 'Iniciada',
      detail: null,
      timestamp: wo.startedAt,
      tone: 'bg-amber-500',
    } : null,
    wo.completedAt ? {
      label: 'Concluída',
      detail: null,
      timestamp: wo.completedAt,
      tone: 'bg-emerald-500',
    } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Link href="/dashboard/work-orders" className="hover:text-blue-600">Ordens de Serviço</Link>
        <span>/</span>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{wo.code}</span>
      </div>

      {/* Header */}
      <div className="fluent-card p-5 sm:p-6"
        style={{
          background: overdue ? 'rgba(254,242,242,0.5)' : 'var(--surface)',
          borderColor: overdue ? '#fca5a5' : 'var(--border)',
        }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="rounded-full px-2 py-1 font-mono text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{wo.code}</span>
              <Badge value={wo.status} />
              <Badge value={wo.priority} type="priority" />
              {overdue && <span className="fluent-badge bg-red-100 text-red-700">Vencida</span>}
            </div>
            <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{wo.title}</h1>
            <p className="mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{wo.description}</p>
          </div>

          {/* Ações de status */}
          {transitions.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[210px] lg:grid-cols-1">
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
                  className="fluent-button fluent-button-secondary h-11 justify-center px-4 text-sm"
                >
                  Reatribuir
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
          <div className="fluent-card p-5">
            <h2 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Timeline</h2>
            <div className="space-y-2">
              {timelineItems.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <div className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${item.tone}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</p>
                    {item.detail && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.detail}</p>}
                    {item.timestamp && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateTime(item.timestamp)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notas */}
          {wo.notes && (
            <div className="fluent-card border-amber-200 bg-amber-50/70 p-5">
              <h2 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Observações</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{wo.notes}</p>
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
            {wo.cost != null && <InfoRow label="Custo" value={`R$ ${wo.cost.toFixed(2).replace('.', ',')}`} />}
            {wo.supplier && <InfoRow label="Fornecedor" value={wo.supplier.name} />}
          </InfoCard>

          {wo.materialsUsed && (
            <InfoCard title="Materiais/Peças Utilizados">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{wo.materialsUsed}</p>
            </InfoCard>
          )}

          <InfoCard title="Pessoas">
            <InfoRow label="Criador" value={wo.creator.name} />
            <InfoRow label="Técnico" value={
              wo.assignee
                ? wo.assignee.name
                : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Não atribuído</span>
            } />
          </InfoCard>
        </div>
      </div>

      {/* Modal atualizar status */}
      <Modal open={!!statusModal} onClose={() => { setStatusModal(null); setStatusCost(''); setStatusMaterials(''); }} title={statusModal?.label ?? ''} size="sm">
        {statusModal && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Deseja {statusModal.label.toLowerCase()} esta OS?</p>
            {statusModal.status === 'COMPLETED' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Custo total (R$)</label>
                  <input
                    type="text" inputMode="decimal"
                    className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    value={statusCost} onChange={(e) => setStatusCost(e.target.value)} placeholder="Ex: 250,00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Materiais/peças utilizados</label>
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" rows={2}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    value={statusMaterials} onChange={(e) => setStatusMaterials(e.target.value)} placeholder="Ex: 2x correia, 1L de óleo..." />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Observação (opcional)</label>
              <textarea
                className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none" rows={3}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Informe detalhes..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStatusModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>Cancelar</button>
              <button onClick={() => handleStatusChange(statusModal.status)} disabled={saving}
                className="flex-1 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--accent)' }}>
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
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors border"
              style={{
                borderColor: wo.assignee?.id === u.id ? '#3b82f6' : 'var(--border)',
                background: wo.assignee?.id === u.id ? '#eff6ff' : 'transparent',
              }}>
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-700 text-sm">{u.name.charAt(0)}</span>
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ROLE_LABELS[u.role] ?? u.role}</p>
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
    <div className="fluent-card p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
