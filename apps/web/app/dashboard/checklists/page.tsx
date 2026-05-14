'use client';

import { useCallback, useEffect, useState } from 'react';
import { checklistsApi, schedulesApi, usersApi, unitsApi, Checklist, ChecklistSchedule, Execution, Unit, User } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDateTime, getUser, canManage } from '../../../lib/auth';
import { api } from '../../../lib/api';

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clRes, exRes] = await Promise.all([
        checklistsApi.list({ limit: 50 }),
        checklistsApi.executions({ limit: 20 }),
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

  const TYPE_ICONS: Record<string, string> = {
    PREVENTIVE: '🛡️', CORRECTIVE: '🔨', INSPECTION: '🔍', AUDIT: '📋',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Checklists</h1>
          <p className="text-sm text-slate-500">{checklists.length} templates ativos</p>
        </div>
        {canCreate && (
          <button onClick={() => setCreating(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            + Novo Checklist
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['templates', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-slate-500 hover:text-gray-700'}`}>
            {t === 'templates' ? '📋 Templates' : '📜 Histórico'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {checklists.length === 0 && (
            <div className="col-span-full bg-white rounded-xl border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-lg font-semibold text-slate-700">Nenhum checklist cadastrado</p>
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
              <div key={cl.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl">{TYPE_ICONS[cl.type] ?? '📋'}</span>
                  <Badge value={cl.type} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{cl.name}</h3>
                  {cl.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{cl.description}</p>}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  <span>📌 {cl.items.length} itens</span>
                  {cl.unit && <span>🏢 {cl.unit.name}</span>}
                  {cl.intervalDays && <span>🔄 A cada {cl.intervalDays}d</span>}
                  {cl._count && <span>📊 {cl._count.executions} execuções</span>}
                </div>

                {/* Badge de agenda */}
                {sch && nextDate && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
                    isOverdue ? 'bg-red-50 border-red-200 text-red-700' :
                    isToday   ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    isSoon    ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    <span className="text-base">{isOverdue ? '🚨' : isToday ? '⏰' : '📅'}</span>
                    <div className="flex-1 min-w-0">
                      <span>
                        {isOverdue
                          ? `Vencido há ${Math.abs(diffDays!)}d — ${nextDate.toLocaleDateString('pt-BR')}`
                          : isToday ? 'Previsto para hoje'
                          : `Próxima: ${nextDate.toLocaleDateString('pt-BR')}${diffDays === 1 ? ' (amanhã)' : ` (em ${diffDays}d)`}`
                        }
                      </span>
                      {sch.assignee && <span className="ml-2 opacity-75">· {sch.assignee.name}</span>}
                    </div>
                    {sch.reminderDaysBefore ? (
                      <span className="flex-shrink-0">🔔 {sch.reminderDaysBefore}d antes</span>
                    ) : null}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => startExecution(cl)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    ▶ Executar
                  </button>
                  {canCreate && (
                    <>
                      <button
                        onClick={() => setScheduling(cl)}
                        className={`px-3 border text-sm font-semibold rounded-xl transition-colors ${
                          sch ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' :
                                'border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                        title={sch ? 'Editar agenda' : 'Agendar'}
                      >
                        {sch ? '🗓️' : '🗓️+'}
                      </button>
                      <button
                        onClick={() => setEditing(cl)}
                        className="px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold rounded-xl transition-colors"
                        title="Editar checklist"
                      >
                        ✏️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {executions.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-3">📜</p>
              <p className="text-lg font-semibold text-slate-700">Nenhuma execução registrada</p>
            </div>
          )}
          {executions.map((ex) => (
            <div key={ex.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge value={ex.status} />
                  {ex.score !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      ex.score >= 80 ? 'bg-green-100 text-green-700' :
                      ex.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>{ex.score}% conformidade</span>
                  )}
                </div>
                <p className="font-semibold text-gray-900">{ex.checklist.name}</p>
                <div className="flex flex-wrap gap-4 mt-1 text-xs text-slate-500">
                  <span>👤 {ex.user.name}</span>
                  {ex.asset && <span>🏗️ {ex.asset.name}</span>}
                  <span>📌 {ex._count.items} itens respondidos</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400">{formatDateTime(ex.completedAt ?? ex.startedAt)}</p>
              </div>
            </div>
          ))}
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

interface ChecklistItemForm { question: string; requiresPhoto: boolean; requiresNote: boolean; }

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
          .map((i) => ({ question: i.question, requiresPhoto: i.requiresPhoto, requiresNote: i.requiresNote }))
      : [{ question: '', requiresPhoto: false, requiresNote: false }],
  );

  const [saving, setSaving] = useState(false);

  function addItem() { setItems([...items, { question: '', requiresPhoto: false, requiresNote: false }]); }
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

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Metadados */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do checklist *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex: Inspeção Mensal — Elevadores" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição</label>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrição opcional do checklist" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Periodicidade (dias)</label>
          <input type="number" min="1" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.intervalDays} onChange={(e) => setForm(f => ({ ...f, intervalDays: e.target.value }))}
            placeholder="ex: 30" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
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
            <label className="text-xs font-semibold text-slate-600">Itens do checklist *</label>
            <span className="ml-2 text-xs text-slate-400">{items.length} item(ns)</span>
          </div>
          <button type="button" onClick={addItem}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
            + Adicionar item
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              {/* Ordem e reordenação */}
              <div className="flex flex-col gap-0.5 flex-shrink-0 mt-1">
                <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none">▲</button>
                <span className="text-xs font-bold text-slate-400 text-center">{idx + 1}</span>
                <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 text-xs leading-none">▼</button>
              </div>

              <div className="flex-1 space-y-2">
                <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={item.question}
                  onChange={(e) => updateItem(idx, 'question', e.target.value)}
                  placeholder="Pergunta do checklist..." />
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={item.requiresPhoto}
                      onChange={(e) => updateItem(idx, 'requiresPhoto', e.target.checked)} className="rounded" />
                    📷 Exige foto
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={item.requiresNote}
                      onChange={(e) => updateItem(idx, 'requiresNote', e.target.checked)} className="rounded" />
                    📝 Exige nota
                  </label>
                </div>
              </div>

              <button type="button" onClick={() => removeItem(idx)}
                disabled={items.length === 1}
                className="text-slate-300 hover:text-red-500 disabled:opacity-20 mt-1 flex-shrink-0 text-lg leading-none transition-colors"
                title="Remover item">
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nome da agenda (opcional)</label>
        <input
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder={`ex: ${checklist.name} — Torre A`}
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Técnico responsável</label>
        <select
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.assigneeId}
          onChange={(e) => setForm(f => ({ ...f, assigneeId: e.target.value }))}
        >
          <option value="">Sem técnico específico</option>
          {technicians.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Próxima execução *</label>
          <input
            required
            type="date"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.nextDueAt}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setForm(f => ({ ...f, nextDueAt: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Repetir a cada (dias)</label>
          <input
            type="number"
            min="1"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="ex: 30"
            value={form.repeatDays}
            onChange={(e) => setForm(f => ({ ...f, repeatDays: e.target.value }))}
          />
          <p className="text-xs text-slate-400 mt-0.5">Deixe vazio para execução única</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">🔔 Aviso antecipado</label>
        <select
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
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
        <p className="text-xs text-slate-400 mt-1">
          O técnico receberá uma notificação push no celular nessa antecedência.
        </p>
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
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
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
            <p className="text-3xl font-extrabold text-gray-900">{score}%</p>
            <p className="text-sm text-slate-500 mt-1">de conformidade</p>
          </div>
          <p className={`text-sm font-semibold ${score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
            {score >= 80 ? 'Excelente — todos os itens em conformidade' :
             score >= 60 ? 'Atenção — alguns itens precisam de correção' :
             'Crítico — muitos itens fora de conformidade'}
          </p>
          <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
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
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Item {current + 1} de {items.length}</span>
            <span>{answeredCount} respondidos</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-2 bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Item */}
        <div className="bg-slate-50 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-white">{item.order}</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{item.question}</p>
              {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}
            </div>
          </div>

          {/* Resposta */}
          <div className="flex gap-3">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                onClick={() => setAnswer(item.id, val)}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                  answers[item.id]?.answer === val
                    ? val ? 'bg-green-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
                    : val ? 'border-2 border-green-300 text-green-700 hover:bg-green-50' : 'border-2 border-red-300 text-red-700 hover:bg-red-50'
                }`}
              >
                {val ? '✓ Sim / OK' : '✗ Não / NOK'}
              </button>
            ))}
          </div>

          {/* Notas */}
          {(item.requiresNote || answers[item.id]?.answer === false) && (
            <textarea
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="flex-1 border border-slate-200 hover:bg-slate-50 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
          >← Anterior</button>
          {current < items.length - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
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
                idx === current ? 'bg-blue-600 scale-125' :
                answers[it.id]?.answer !== null ? 'bg-green-400' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Notas gerais (último item) */}
        {current === items.length - 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Observações gerais (opcional)</label>
            <textarea rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Observações gerais sobre a inspeção..."
              value={globalNotes} onChange={(e) => setGlobalNotes(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
