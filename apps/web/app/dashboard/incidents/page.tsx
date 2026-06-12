'use client';

import { useCallback, useEffect, useState } from 'react';
import { unitsApi, Unit } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDateTime, getUser } from '../../../lib/auth';
import { api } from '../../../lib/api';

interface Incident {
  id: string; title: string; description: string; severity: string; status: string;
  createdAt: string; resolvedAt: string | null;
  photoUrls: string[];
  unit: { id: string; name: string };
  reporter: { id: string; name: string };
}

const SEV_TABS = [
  { key: '', label: 'Todos' },
  { key: 'CRITICAL', label: 'Críticas' },
  { key: 'HIGH', label: 'Altas' },
  { key: 'MEDIUM', label: 'Médias' },
  { key: 'LOW', label: 'Baixas' },
];

const STATUS_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  OPEN: [{ status: 'INVESTIGATING', label: 'Investigar' }, { status: 'RESOLVED', label: 'Resolver' }],
  INVESTIGATING: [{ status: 'RESOLVED', label: 'Marcar resolvido' }, { status: 'CLOSED', label: 'Fechar' }],
  RESOLVED: [{ status: 'CLOSED', label: 'Fechar' }, { status: 'OPEN', label: 'Reabrir' }],
  CLOSED: [{ status: 'OPEN', label: 'Reabrir' }],
};

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-emerald-100 text-emerald-800',
};

const SEV_LABELS: Record<string, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

const SEV_RAILS: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-emerald-500',
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const user = getUser();
  const canDelete = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '20' };
      if (sevFilter) params.severity = sevFilter;
      const res = await api.get<{ data: Incident[]; total: number }>('/incidents', { params });
      setIncidents(res.data.data);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  }, [sevFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    unitsApi.list().then((r) => setUnits(r.data.data)).catch(() => {});
  }, []);

  async function handleDelete(incident: Incident) {
    if (!confirm(`Excluir a ocorrência "${incident.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/incidents/${incident.id}`);
      load();
      setDetail(null);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro ao excluir');
    }
  }

  async function handleStatus(incident: Incident, status: string) {
    try {
      await api.patch(`/incidents/${incident.id}/status`, { status });
      load();
      setDetail(null);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro');
    }
  }

  return (
    <div className="space-y-5">
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Foto ampliada" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}

      {/* Modal detalhe da ocorrência */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalhes da Ocorrência" size="md">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${SEV_COLORS[detail.severity] ?? ''}`}>{SEV_LABELS[detail.severity] ?? detail.severity}</span>
              <Badge value={detail.status} />
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{detail.title}</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{detail.description}</p>
            </div>
            <div className="grid gap-2 rounded-2xl p-3 text-xs sm:grid-cols-2" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
              <span><strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Unidade</strong>{detail.unit.name}</span>
              <span><strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Registrada por</strong>{detail.reporter.name}</span>
              <span><strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Registro</strong>{formatDateTime(detail.createdAt)}</span>
              {detail.resolvedAt && <span><strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Resolução</strong>{formatDateTime(detail.resolvedAt)}</span>}
            </div>
            {detail.photoUrls?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Fotos ({detail.photoUrls.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {detail.photoUrls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-32 object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                      style={{ border: '1px solid var(--border)' }}
                      onClick={() => setLightbox(url)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              {(STATUS_TRANSITIONS[detail.status] ?? []).map((t) => (
                <button key={t.status} onClick={() => handleStatus(detail, t.status)}
                  className="fluent-button fluent-button-secondary h-9 px-3 text-xs">
                  {t.label}
                </button>
              ))}
              {canDelete && (
                <button onClick={() => handleDelete(detail)}
                  className="fluent-button fluent-button-ghost ml-auto h-9 px-3 text-xs text-red-600 hover:!border-red-200 hover:!bg-red-50">
                  Excluir
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Ocorrências</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{total} ocorrências registradas</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="fluent-button fluent-button-danger h-11 px-4 text-sm">
          + Registrar Ocorrência
        </button>
      </div>

      {/* Filtros de severidade */}
      <div className="fluent-filter-bar flex-wrap !gap-1 !p-3">
        {SEV_TABS.map((t) => (
          <button key={t.key} onClick={() => setSevFilter(t.key)}
            className={`fluent-filter-chip ${sevFilter === t.key ? 'fluent-filter-chip-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#ef4444', borderTopColor: 'transparent' }} />
        </div>
      ) : incidents.length === 0 ? (
        <div className="fluent-card p-16 text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhuma ocorrência registrada</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>A fila operacional aparecerá aqui quando houver novos registros.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => {
            const transitions = STATUS_TRANSITIONS[inc.status] ?? [];
            return (
              <div
                key={inc.id}
                className="fluent-card fluent-card-interactive cursor-pointer overflow-hidden"
                onClick={() => setDetail(inc)}
              >
                <div className="flex">
                  <span className={`w-1.5 flex-shrink-0 ${SEV_RAILS[inc.severity] ?? 'bg-slate-300'}`} />
                  <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-center lg:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`fluent-badge ${SEV_COLORS[inc.severity] ?? ''}`}>
                          {SEV_LABELS[inc.severity] ?? inc.severity}
                        </span>
                        <Badge value={inc.status} />
                        {inc.photoUrls?.length > 0 && (
                          <span className="fluent-badge bg-blue-50 text-blue-700">{inc.photoUrls.length} foto(s)</span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold sm:text-base" style={{ color: 'var(--text-primary)' }}>{inc.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--text-muted)' }}>{inc.description}</p>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3" style={{ color: 'var(--text-muted)' }}>
                        <span className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-2)' }}>
                          <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Unidade</strong>
                          {inc.unit.name}
                        </span>
                        <span className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-2)' }}>
                          <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>Responsável</strong>
                          {inc.reporter.name}
                        </span>
                        <span className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-2)' }}>
                          <strong className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>{inc.resolvedAt ? 'Resolução' : 'Registro'}</strong>
                          {formatDateTime(inc.resolvedAt ?? inc.createdAt)}
                        </span>
                      </div>
                    </div>
                    {transitions.length > 0 && (
                      <div className="flex flex-wrap gap-2 lg:w-48 lg:flex-col lg:items-stretch" onClick={(e) => e.stopPropagation()}>
                        {transitions.map((t) => (
                          <button key={t.status} onClick={() => handleStatus(inc, t.status)}
                            className="fluent-button fluent-button-secondary h-9 px-3 text-xs">
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal criar */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Registrar Ocorrência" size="md">
        <CreateIncidentForm units={units} onSuccess={() => { setCreating(false); load(); }} />
      </Modal>
    </div>
  );
}

// Dicionário de palavras-chave por severidade — ordem importa (CRITICAL primeiro)
const SEVERITY_KEYWORDS: [string, string[]][] = [
  ['CRITICAL', ['incêndio', 'explosão', 'curto-circuito', 'inundação', 'emergência', 'colapso', 'desabamento', 'fogo', 'acidente', 'ferido', 'sem saída', 'pânico']],
  ['HIGH',     ['vazamento', 'elétrico', 'elevador', 'estrutural', 'gás', 'sem energia', 'infiltração', 'quebrado', 'parado', 'não funciona', 'falha', 'risco de']],
  ['MEDIUM',   ['ar condicionado', 'interfone', 'água quente', 'fechadura', 'iluminação', 'portão', 'bomba', 'barulho', 'intermitente', 'irregular']],
  ['LOW',      ['pintura', 'limpeza', 'estético', 'desgaste', 'risco', 'adesivo', 'placa', 'sujeira']],
];

const SEV_SUGGESTION_LABELS: Record<string, string> = {
  CRITICAL: '🔴 Crítico', HIGH: '🟠 Alto', MEDIUM: '🟡 Médio', LOW: '🟢 Baixo',
};

function suggestSeverity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [sev, words] of SEVERITY_KEYWORDS) {
    for (const word of words) {
      if (lower.includes(word)) return sev;
    }
  }
  return null;
}

function CreateIncidentForm({ units, onSuccess }: { units: Unit[]; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', unitId: '', severity: 'MEDIUM' });
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // Detecta severidade sugerida ao digitar título ou descrição
  useEffect(() => {
    if (suggestionDismissed) return;
    const text = `${form.title} ${form.description}`;
    const sug = suggestSeverity(text);
    setSuggestion(sug && sug !== form.severity ? sug : null);
  }, [form.title, form.description, form.severity, suggestionDismissed]);

  function applySuggestion() {
    if (!suggestion) return;
    setForm(f => ({ ...f, severity: suggestion }));
    setSuggestion(null);
    setSuggestionDismissed(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/incidents', form);
      onSuccess();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro');
    } finally { setSaving(false); }
  }

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Título *</label>
        <input required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.title} onChange={(e) => { setForm(f => ({ ...f, title: e.target.value })); setSuggestionDismissed(false); }}
          placeholder="ex: Vazamento na bomba hidráulica" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={labelStyle}>Descrição *</label>
        <textarea required rows={4} className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
          style={inputStyle}
          value={form.description} onChange={(e) => { setForm(f => ({ ...f, description: e.target.value })); setSuggestionDismissed(false); }}
          placeholder="Descreva a ocorrência em detalhes..." />
      </div>

      {/* Sugestão de severidade */}
      {suggestion && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-base">🤖</span>
          <p className="text-sm text-amber-800 flex-1">
            Severidade sugerida: <strong>{SEV_SUGGESTION_LABELS[suggestion]}</strong>
          </p>
          <button type="button" onClick={applySuggestion}
            className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-lg transition-colors">
            Aplicar
          </button>
          <button type="button" onClick={() => setSuggestionDismissed(true)}
            className="text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Unidade *</label>
          <select required className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.unitId} onChange={(e) => setForm(f => ({ ...f, unitId: e.target.value }))}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={labelStyle}>Severidade</label>
          <select className="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            style={inputStyle}
            value={form.severity} onChange={(e) => { setForm(f => ({ ...f, severity: e.target.value })); setSuggestionDismissed(true); }}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
              <option key={s} value={s}>{SEV_SUGGESTION_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
        {saving ? 'Registrando...' : '⚠️ Registrar Ocorrência'}
      </button>
    </form>
  );
}
