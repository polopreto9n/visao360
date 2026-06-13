'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { checklistsApi, schedulesApi, usersApi, unitsApi, Checklist, ChecklistSchedule, Execution, Unit, User } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDateTime, getUser, canManage, canAdmin, ROLE_LABELS } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { downloadCsv } from '../../../lib/csv';

function groupExecutions(executions: Execution[]): Execution[][] {
  const m: { [key: string]: Execution[] } = {};
  const sorted = executions.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i].checklist.id;
    if (!m[id]) { m[id] = []; }
    m[id].push(sorted[i]);
  }
  return Object.values(m);
}

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ChecklistSchedule | null>>({});
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<Checklist | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [tab, setTab] = useState<'templates' | 'history'>('templates');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Checklist | null>(null);
  const [scheduling, setScheduling] = useState<Checklist | null>(null);
  const user = getUser();
  const canCreate = canManage(user?.role ?? '');
  const isAdmin = canAdmin(user?.role ?? '');
  const [deletingCl, setDeletingCl] = useState<Checklist | null>(null);
  const [deleteClLoading, setDeleteClLoading] = useState(false);
  const [deletingEx, setDeletingEx] = useState<Execution | null>(null);
  const [deleteExLoading, setDeleteExLoading] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clRes, exRes] = await Promise.all([
        checklistsApi.list({ limit: 50 }),
        checklistsApi.executions({ limit: 100 }),
      ]);
      setChecklists(clRes.data.data);
      setExecutions(exRes.data.data);

      // Busca agenda de cada checklist em paralelo
      const schEntries = await Promise.all(
        clRes.data.data.map((cl) =>
          schedulesApi.byChecklist(cl.id)
            .then((r) => [cl.id, r.data] as [string, ChecklistSchedule | null])
            .catch(() => [cl.id, null] as [string, null]),
        ),
      );
      setSchedules(Object.fromEntries(schEntries));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    unitsApi.list().then((r) => setUnits(r.data.data)).catch(() => {});
    usersApi.list({ limit: 100 }).then((r) => setUsers(r.data.data)).catch(() => {});
  }, []);

  async function startExecution(cl: Checklist) {
    try {
      const res = await checklistsApi.start(cl.id);
      setExecutionId(res.data.id);
      setExecuting(cl);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao iniciar checklist');
    }
  }

  async function handleDeleteExecution(ex: Execution) {
    setDeleteExLoading(true);
    try {
      await checklistsApi.deleteExecution(ex.id);
      setDeletingEx(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao excluir execução');
    } finally { setDeleteExLoading(false); }
  }

  async function handleDeleteChecklist(cl: Checklist) {
    setDeleteClLoading(true);
    try {
      await checklistsApi.remove(cl.id);
      setDeletingCl(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao excluir checklist');
    } finally { setDeleteClLoading(false); }
  }

  const TYPE_MARKS: Record<string, string> = {
    PREVENTIVE: 'PR', CORRECTIVE: 'CO', INSPECTION: 'IN', AUDIT: 'AU',
  };

  const executionGroups = groupExecutions(executions);

  function handleExportCsv() {
    const rows = executions.map((ex) => [
      ex.checklist.name,
      ex.user.name,
      ex.asset?.name ?? '',
      ex.status,
      ex.score !== null ? `${ex.score}%` : '',
      ex._count.items,
      formatDateTime(ex.completedAt ?? ex.startedAt ?? ex.createdAt),
    ]);
    downloadCsv('execucoes-checklists.csv', [
      'Checklist', 'Responsável', 'Equipamento', 'Status', 'Conformidade', 'Itens', 'Data',
    ], rows);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Checklists</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{checklists.length} modelos ativos</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreating(true)}
            className="fluent-button fluent-button-primary h-11 px-4 text-sm"
          >
            + Novo Checklist
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="fluent-filter-bar w-fit !gap-1 !p-1">
        {(['templates', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`fluent-filter-chip px-4 text-sm ${tab === t ? 'fluent-filter-chip-active' : ''}`}
          >
            {t === 'templates' ? 'Modelos' : 'Histórico'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : tab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {checklists.length === 0 && (
            <div className="fluent-card col-span-full p-16 text-center">
              <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum checklist cadastrado</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Os modelos disponíveis para execução aparecerão aqui.</p>
            </div>
          )}
          {checklists.map((cl) => {
            const sch = schedules[cl.id];
            const nextDate = sch ? new Date(sch.nextDueAt) : null;
            const today = new Date(); today.setHours(0,0,0,0);
            const diffDays = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null;
            const isOverdue = diffDays !== null && diffDays < 0;
            const isToday = diffDays === 0;
            const isSoon = diffDays !== null && diffDays > 0 && diffDays <= 3;

            return (
              <div
                key={cl.id}
                className="fluent-card flex flex-col gap-4 p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-black"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {TYPE_MARKS[cl.type] ?? 'CL'}
                    </span>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 font-bold" style={{ color: 'var(--text-primary)' }}>{cl.name}</h3>
                      {cl.description && <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--text-muted)' }}>{cl.description}</p>}
                    </div>
                  </div>
                  <Badge value={cl.type} />
                </div>

                <div className="grid gap-2 text-xs sm:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Itens</strong>
                    {cl.items.length}
                  </span>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Periodicidade</strong>
                    {cl.intervalDays ? `A cada ${cl.intervalDays} dia(s)` : 'Sem repetição definida'}
                  </span>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Unidade</strong>
                    {cl.unit?.name ?? 'Todas as unidades'}
                  </span>
                  <span className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Execuções</strong>
                    {cl._count?.executions ?? 0}
                  </span>
                </div>

                {/* Badge de agenda */}
                {sch && nextDate && (
                  <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-xs font-semibold ${
                    isOverdue ? 'bg-red-50 border-red-200 text-red-700' :
                    isToday   ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    isSoon    ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-current opacity-80" />
                    <div className="flex-1 min-w-0">
                      <span className="block">
                        {isOverdue
                          ? `Vencido há ${Math.abs(diffDays!)} dia(s)`
                          : isToday ? 'Previsto para hoje'
                          : `Próxima execução em ${diffDays} dia(s)`
                        }
                      </span>
                      <span className="block font-medium opacity-80">
                        {nextDate.toLocaleDateString('pt-BR')}{sch.assignee ? ` · ${sch.assignee.name}` : ''}
                      </span>
                    </div>
                    {sch.reminderDaysBefore ? (
                      <span className="flex-shrink-0 rounded-full bg-white/70 px-2 py-1">{sch.reminderDaysBefore} dia(s) antes</span>
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => startExecution(cl)}
                    className="fluent-button fluent-button-primary h-10 w-full px-4 text-sm sm:w-auto"
                  >
                    Executar
                  </button>
                  {canCreate && (
                    <>
                      <button
                        onClick={() => setScheduling(cl)}
                        className={`fluent-button h-10 px-3 text-xs ${sch ? 'fluent-button-secondary text-blue-700' : 'fluent-button-ghost'}`}
                        title={sch ? 'Editar agenda' : 'Agendar'}
                      >
                        {sch ? 'Editar agenda' : 'Agendar'}
                      </button>
                      <button
                        onClick={() => setEditing(cl)}
                        className="fluent-button fluent-button-ghost h-10 px-3 text-xs"
                        title="Editar checklist"
                      >
                        Editar
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeletingCl(cl)}
                          className="fluent-button fluent-button-ghost h-10 px-3 text-xs text-red-600 hover:!border-red-200 hover:!bg-red-50"
                          title="Excluir checklist"
                        >
                          Excluir
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {executions.length > 0 && (
            <div className="flex justify-end">
              <button onClick={handleExportCsv}
                className="fluent-button fluent-button-secondary h-9 px-3 text-xs">
                ⬇ Exportar CSV
              </button>
            </div>
          )}
          {executionGroups.length === 0 && (
            <div className="fluent-card p-16 text-center">
              <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhuma execução registrada</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>O histórico dos checklists concluídos ficará disponível aqui.</p>
            </div>
          )}
          {executionGroups.map((group) => {
            const latest = group[0];
            const checklistId = latest.checklist.id;
            const isExpanded = expandedGroups.has(checklistId);
            const displayList = isExpanded ? group : [latest];
            const extra = group.length - 1;
            return (
              <div key={checklistId} className="fluent-card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{latest.checklist.name}</span>
                    {group.length > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
                        {group.length} execuções
                      </span>
                    )}
                  </div>
                  {extra > 0 && (
                    <button
                      onClick={() => setExpandedGroups(prev => {
                        const next = new Set(prev);
                        isExpanded ? next.delete(checklistId) : next.add(checklistId);
                        return next;
                      })}
                      className="text-xs font-semibold transition-colors"
                      style={{ color: 'var(--accent)' }}
                    >
                      {isExpanded ? '▲ Recolher' : `▼ Ver mais ${extra} anterior${extra > 1 ? 'es' : ''}`}
                    </button>
                  )}
                </div>
                <div style={{ borderTop: 'none' }}>
                  {displayList.map((ex) => (
                    <div key={ex.id} className="flex items-start gap-4 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                      <Link href={`/dashboard/executions/${ex.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge value={ex.status} />
                          {ex.score !== null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              ex.score >= 80 ? 'bg-green-100 text-green-700' :
                              ex.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>{ex.score}% conformidade</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="rounded-full px-2 py-1" style={{ background: 'var(--surface-2)' }}>Responsável: {ex.user.name}</span>
                          {ex.asset && <span className="rounded-full px-2 py-1" style={{ background: 'var(--surface-2)' }}>Equipamento: {ex.asset.name}</span>}
                          <span className="rounded-full px-2 py-1" style={{ background: 'var(--surface-2)' }}>{ex._count.items} item(ns)</span>
                        </div>
                      </Link>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateTime(ex.completedAt ?? ex.startedAt)}</p>
                        <Link href={`/dashboard/executions/${ex.id}`} className="text-xs" style={{ color: 'var(--accent)' }}>Ver →</Link>
                        {isAdmin && (
                          <button onClick={() => setDeletingEx(ex)}
                            className="text-xs font-semibold transition-colors hover:text-red-500"
                            style={{ color: 'var(--text-muted)' }}
                            title="Excluir">Excluir</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-center text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            {executionGroups.length} checklist{executionGroups.length !== 1 ? 's' : ''} · {executions.length} execução{executions.length !== 1 ? 'ões' : ''} no total
          </p>
        </div>
      )}

      {/* Modal de execução */}
      {executing && executionId && (
        <ExecutionModal
          checklist={executing}
          executionId={executionId}
          onClose={() => { setExecuting(null); setExecutionId(null); load(); }}
        />
      )}

      {/* Modal criar checklist */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo Checklist" size="lg">
        <CreateChecklistForm units={units} onSuccess={() => { setCreating(false); load(); }} />
      </Modal>

      {/* Modal editar checklist */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar — ${editing?.name ?? ''}`}
        size="lg"
      >
        {editing && (
          <CreateChecklistForm
            units={units}
            checklist={editing}
            onSuccess={() => { setEditing(null); load(); }}
          />
        )}
      </Modal>

      {/* Modal excluir execução */}
      <Modal open={!!deletingEx} onClose={() => setDeletingEx(null)} title="Excluir do Histórico" size="sm">
        {deletingEx && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Excluir esta execução de <strong>{deletingEx.checklist.name}</strong> por <strong>{deletingEx.user.name}</strong>?
            </p>
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Esta ação é permanente e remove fotos e assinaturas vinculadas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingEx(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--surface)' }}>
                Cancelar
              </button>
              <button onClick={() => handleDeleteExecution(deletingEx)} disabled={deleteExLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                {deleteExLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <Modal open={!!deletingCl} onClose={() => setDeletingCl(null)} title="Excluir Checklist" size="sm">
        {deletingCl && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Tem certeza que deseja desativar o checklist <strong>{deletingCl.name}</strong>?
            </p>
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              O checklist será desativado e não aparecerá mais na lista. O histórico de execuções é preservado.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingCl(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--surface)' }}>
                Cancelar
              </button>
              <button onClick={() => handleDeleteChecklist(deletingCl)} disabled={deleteClLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                {deleteClLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal agendar checklist */}
      <Modal
        open={!!scheduling}
        onClose={() => setScheduling(null)}
        title={`🗓️ Agendar — ${scheduling?.name ?? ''}`}
        size="md"
      >
        {scheduling && (
          <ScheduleForm
            checklist={scheduling}
            existingSchedule={schedules[scheduling.id] ?? null}
            users={users}
            onSuccess={() => { setScheduling(null); load(); }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Criar Checklist ─────────────────────────────────────────────────────────

interface ChecklistItemForm { question: string; requiresPhoto: boolean; requiresNote: boolean; expectedAnswer: boolean; }

function CreateChecklistForm({
  units, checklist, onSuccess,
}: {
  units: Unit[];
  checklist?: Checklist;     // se passado → modo edição
  onSuccess: () => void;
}) {
  const isEditing = !!checklist;

  const [form, setForm] = useState({
    name: checklist?.name ?? '',
    description: checklist?.description ?? '',
    type: checklist?.type ?? 'PREVENTIVE',
    unitId: checklist?.unit?.id ?? '',
    intervalDays: checklist?.intervalDays?.toString() ?? '',
  });

  const [items, setItems] = useState<ChecklistItemForm[]>(
    checklist && checklist.items.length > 0
      ? [...checklist.items]
          .sort((a, b) => a.order - b.order)
          .map((i) => ({ question: i.question, requiresPhoto: i.requiresPhoto, requiresNote: i.requiresNote, expectedAnswer: i.expectedAnswer ?? true }))
      : [{ question: '', requiresPhoto: false, requiresNote: false, expectedAnswer: true }],
  );

  const [saving, setSaving] = useState(false);

  function addItem() { setItems([...items, { question: '', requiresPhoto: false, requiresNote: false, expectedAnswer: true }]); }
  function removeItem(i: number) { if (items.length > 1) setItems(items.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof ChecklistItemForm, value: string | boolean) {
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  }
  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setItems(arr);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emptyItems = items.filter((i) => !i.question.trim());
    if (emptyItems.length > 0) { alert('Preencha todas as perguntas'); return; }
    setSaving(true);

    const payload = {
      ...form,
      unitId: form.unitId || undefined,
      intervalDays: form.intervalDays ? Number(form.intervalDays) : undefined,
      items: items.map((it, idx) => ({ order: idx + 1, ...it })),
    };

    try {
      if (isEditing && checklist) {
        await checklistsApi.update(checklist.id, payload);
      } else {
        await api.post('/checklists', payload);
      }
      onSuccess();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  const TYPE_LABELS: Record<string, string> = {
    PREVENTIVE: 'Preventivo', CORRECTIVE: 'Corretivo', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
  };

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Metadados */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Nome do checklist *</label>
          <input required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex: Inspeção Mensal — Elevadores" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Descrição</label>
          <input className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrição opcional do checklist" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Tipo</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Periodicidade (dias)</label>
          <input type="number" min="1" className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.intervalDays} onChange={(e) => setForm(f => ({ ...f, intervalDays: e.target.value }))}
            placeholder="ex: 30" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Unidade</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.unitId} onChange={(e) => setForm(f => ({ ...f, unitId: e.target.value }))}>
            <option value="">Todas as unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Itens */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-xs font-semibold" style={labelStyle}>Itens do checklist *</label>
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{items.length} item(ns)</span>
          </div>
          <button type="button" onClick={addItem}
            className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            + Adicionar item
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {/* Ordem e reordenação */}
              <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                  className="disabled:opacity-30 text-xs leading-none" style={{ color: 'var(--text-muted)' }}>▲</button>
                <span className="text-xs font-bold text-center" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}
                  className="disabled:opacity-30 text-xs leading-none" style={{ color: 'var(--text-muted)' }}>▼</button>
              </div>

              <div className="flex-1 space-y-2">
                <input required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  style={inputStyle}
                  value={item.question}
                  onChange={(e) => updateItem(idx, 'question', e.target.value)}
                  placeholder="Pergunta do checklist..." />
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={item.requiresPhoto}
                      onChange={(e) => updateItem(idx, 'requiresPhoto', e.target.checked)} className="rounded" />
                    📷 Exige foto
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={item.requiresNote}
                      onChange={(e) => updateItem(idx, 'requiresNote', e.target.checked)} className="rounded" />
                    📝 Exige nota
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>✅ Conforme se:</span>
                    <button
                      type="button"
                      onClick={() => updateItem(idx, 'expectedAnswer', !item.expectedAnswer)}
                      className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${
                        item.expectedAnswer
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-red-100 text-red-700 border-red-300'
                      }`}
                    >
                      {item.expectedAnswer ? 'SIM' : 'NÃO'}
                    </button>
                  </div>
                </div>
              </div>

              <button type="button" onClick={() => removeItem(idx)}
                disabled={items.length === 1}
                className="disabled:opacity-20 mt-1 flex-shrink-0 text-lg leading-none transition-colors hover:text-red-500"
                style={{ color: 'var(--text-muted)' }}
                title="Remover item">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="fluent-button fluent-button-primary h-12 w-full text-sm">
        {saving
          ? 'Salvando...'
          : isEditing
            ? `✓ Salvar alterações (${items.length} itens)`
            : `Criar checklist com ${items.length} item(ns)`}
      </button>
    </form>
  );
}

// ─── Agendar Checklist ───────────────────────────────────────────────────────

function ScheduleForm({
  checklist, existingSchedule, users, onSuccess,
}: {
  checklist: Checklist;
  existingSchedule: ChecklistSchedule | null;
  users: User[];
  onSuccess: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [form, setForm] = useState({
    assigneeId: existingSchedule?.assignee?.id ?? '',
    nextDueAt: existingSchedule
      ? new Date(existingSchedule.nextDueAt).toISOString().split('T')[0]
      : tomorrowStr,
    repeatDays: existingSchedule?.repeatDays?.toString() ?? checklist.intervalDays?.toString() ?? '',
    reminderDaysBefore: existingSchedule?.reminderDaysBefore?.toString() ?? '0',
    releaseBeforeDays: (existingSchedule as any)?.releaseBeforeDays?.toString() ?? '3',
    toleranceDays: (existingSchedule as any)?.toleranceDays?.toString() ?? '2',
    name: existingSchedule?.name ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        checklistId: checklist.id,
        assigneeId: form.assigneeId || undefined,
        nextDueAt: new Date(form.nextDueAt).toISOString(),
        repeatDays: form.repeatDays ? Number(form.repeatDays) : undefined,
        reminderDaysBefore: Number(form.reminderDaysBefore),
        releaseBeforeDays: Number(form.releaseBeforeDays),
        toleranceDays: Number(form.toleranceDays),
        name: form.name || undefined,
      };
      if (existingSchedule) {
        await schedulesApi.update(existingSchedule.id, payload);
      } else {
        await schedulesApi.create(payload);
      }
      onSuccess();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao salvar agenda');
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!existingSchedule) return;
    if (!confirm('Remover esta agenda?')) return;
    setRemoving(true);
    try {
      await schedulesApi.remove(existingSchedule.id);
      onSuccess();
    } finally { setRemoving(false); }
  }

  const technicians = users.filter((u) => ['TECNICO', 'GESTOR', 'ADMIN'].includes(u.role) && u.isActive);
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Nome da agenda (opcional)</label>
        <input
          className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          placeholder={`ex: ${checklist.name} — Torre A`}
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Técnico responsável</label>
        <select
          className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.assigneeId}
          onChange={(e) => setForm(f => ({ ...f, assigneeId: e.target.value }))}
        >
          <option value="">Sem técnico específico</option>
          {technicians.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Próxima execução *</label>
          <input
            required
            type="date"
            className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.nextDueAt}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setForm(f => ({ ...f, nextDueAt: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Repetir a cada (dias)</label>
          <input
            type="number"
            min="1"
            className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            placeholder="ex: 30"
            value={form.repeatDays}
            onChange={(e) => setForm(f => ({ ...f, repeatDays: e.target.value }))}
          />
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Deixe vazio para execução única</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>🔔 Aviso antecipado</label>
        <select
          className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.reminderDaysBefore}
          onChange={(e) => setForm(f => ({ ...f, reminderDaysBefore: e.target.value }))}
        >
          <option value="0">No próprio dia</option>
          <option value="1">1 dia antes</option>
          <option value="2">2 dias antes</option>
          <option value="3">3 dias antes</option>
          <option value="5">5 dias antes</option>
          <option value="7">1 semana antes</option>
          <option value="14">2 semanas antes</option>
        </select>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          O técnico receberá uma notificação no aplicativo com essa antecedência.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>🔓 Liberar antes (dias)</label>
          <input
            type="number" min="0"
            className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.releaseBeforeDays}
            onChange={(e) => setForm(f => ({ ...f, releaseBeforeDays: e.target.value }))}
          />
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Dias antes do vencimento que fica disponível</p>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>⏳ Tolerância (dias)</label>
          <input
            type="number" min="0"
            className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.toleranceDays}
            onChange={(e) => setForm(f => ({ ...f, toleranceDays: e.target.value }))}
          />
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Dias após o vencimento antes de expirar</p>
        </div>
      </div>

      {form.nextDueAt && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold">📅 Resumo</p>
          <p className="mt-0.5">
            Previsto para <strong>{new Date(form.nextDueAt + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</strong>
            {form.repeatDays && `, repetindo a cada ${form.repeatDays} dias`}.
          </p>
          {Number(form.reminderDaysBefore) > 0 && (
            <p className="mt-0.5">
              🔔 Notificação {form.reminderDaysBefore} dia(s) antes —{' '}
              <strong>{new Date(new Date(form.nextDueAt + 'T12:00:00').getTime() - Number(form.reminderDaysBefore) * 86400000).toLocaleDateString('pt-BR')}</strong>
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {existingSchedule && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {removing ? 'Removendo...' : '🗑️ Remover'}
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="fluent-button fluent-button-primary h-12 flex-1 text-sm"
        >
          {saving ? 'Salvando...' : existingSchedule ? '✓ Atualizar agenda' : '✓ Criar agenda'}
        </button>
      </div>
    </form>
  );
}

interface ItemAnswer { answer: boolean | null; notes: string; }

function ExecutionModal({ checklist, executionId, onClose }: {
  checklist: Checklist; executionId: string; onClose: () => void;
}) {
  const items = [...checklist.items].sort((a, b) => a.order - b.order);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ItemAnswer>>(
    Object.fromEntries(items.map((i) => [i.id, { answer: null, notes: '' }]))
  );
  const [globalNotes, setGlobalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);

  const item = items[current];
  const progress = ((current + 1) / items.length) * 100;
  const answeredCount = Object.values(answers).filter((a) => a.answer !== null).length;

  function setAnswer(id: string, answer: boolean) {
    setAnswers((p) => ({ ...p, [id]: { ...p[id], answer } }));
  }
  function setNote(id: string, notes: string) {
    setAnswers((p) => ({ ...p, [id]: { ...p[id], notes } }));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const payload = items.map((i) => ({
        checklistItemId: i.id,
        answer: answers[i.id].answer ?? false,
        notes: answers[i.id].notes || undefined,
      }));
      const res = await checklistsApi.complete(executionId, payload, globalNotes || undefined);
      const data = res.data as { score?: number };
      setScore(data.score ?? 0);
      setDone(true);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao concluir');
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Checklist concluído!" size="sm">
        <div className="text-center space-y-4">
          <div className="text-6xl">{score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌'}</div>
          <div>
            <p className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{score}%</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>de conformidade</p>
          </div>
          <p className={`text-sm font-semibold ${score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
            {score >= 80 ? 'Excelente — todos os itens em conformidade' :
             score >= 60 ? 'Atenção — alguns itens precisam de correção' :
             'Crítico — muitos itens fora de conformidade'}
          </p>
          <button onClick={onClose}
            className="w-full text-white font-semibold py-3 rounded-xl transition-colors"
            style={{ background: 'var(--accent)' }}>
            Concluir
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={checklist.name} size="lg">
      <div className="space-y-5">
        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>Item {current + 1} de {items.length}</span>
            <span>{answeredCount} respondidos</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
            <div className="h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        {/* Item */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
              <span className="text-sm font-bold text-white">{item.order}</span>
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.question}</p>
              {item.description && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{item.description}</p>}
            </div>
          </div>

          {/* Resposta esperada */}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Resposta conforme: <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{item.expectedAnswer ? 'SIM' : 'NÃO'}</span>
          </p>

          {/* Botões Sim / Não com indicação de conformidade */}
          <div className="flex gap-3">
            {([true, false] as const).map((val) => {
              const selected = answers[item.id]?.answer === val;
              const isConform = val === item.expectedAnswer;
              return (
                <button
                  key={String(val)}
                  onClick={() => setAnswer(item.id, val)}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                    selected
                      ? isConform ? 'bg-green-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
                      : isConform ? 'border-2 border-green-300 text-green-700 hover:bg-green-50' : 'border-2 border-red-300 text-red-700 hover:bg-red-50'
                  }`}
                >
                  {val ? '✓ Sim' : '✗ Não'}
                </button>
              );
            })}
          </div>

          {/* Notas */}
          {(item.requiresNote || (answers[item.id]?.answer !== null && answers[item.id]?.answer !== item.expectedAnswer)) && (
            <textarea
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              placeholder={item.requiresNote ? 'Observação obrigatória...' : 'Descreva o problema encontrado...'}
              value={answers[item.id]?.notes ?? ''}
              onChange={(e) => setNote(item.id, e.target.value)}
            />
          )}
        </div>

        {/* Navegação */}
        <div className="flex gap-3">
          <button
            disabled={current === 0}
            onClick={() => setCurrent(c => c - 1)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--surface)' }}
          >← Anterior</button>
          {current < items.length - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'var(--accent)' }}
            >Próximo →</button>
          ) : (
            <button
              onClick={submit} disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >{submitting ? 'Salvando...' : '✓ Concluir'}</button>
          )}
        </div>

        {/* Dots de progresso */}
        <div className="flex flex-wrap gap-1.5 justify-center">
          {items.map((it, idx) => (
            <button
              key={it.id}
              onClick={() => setCurrent(idx)}
              className={`w-3 h-3 rounded-full transition-all ${
                idx === current ? 'scale-125' :
                answers[it.id]?.answer === null ? '' :
                answers[it.id]?.answer === it.expectedAnswer ? 'bg-green-400' : 'bg-red-400'
              }`}
              style={
                idx === current
                  ? { background: 'var(--accent)' }
                  : answers[it.id]?.answer === null
                  ? { background: 'var(--surface-3)' }
                  : undefined
              }
            />
          ))}
        </div>

        {/* Notas gerais (último item) */}
        {current === items.length - 1 && (
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Observações gerais (opcional)</label>
            <textarea rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              placeholder="Observações gerais sobre a inspeção..."
              value={globalNotes} onChange={(e) => setGlobalNotes(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
