'use client';

import { useCallback, useEffect, useState } from 'react';
import { unitsApi, Unit } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatDateTime, getUser, canManage } from '../../../lib/auth';
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
  { key: 'CRITICAL', label: '🔴 Crítico' },
  { key: 'HIGH', label: '🟠 Alto' },
  { key: 'MEDIUM', label: '🟡 Médio' },
  { key: 'LOW', label: '🟢 Baixo' },
];

const STATUS_TRANSITIONS: Record<string, { status: string; label: string }[]> = {
  OPEN: [{ status: 'INVESTIGATING', label: 'Investigar' }, { status: 'RESOLVED', label: 'Resolver' }],
  INVESTIGATING: [{ status: 'RESOLVED', label: 'Marcar resolvido' }, { status: 'CLOSED', label: 'Fechar' }],
  RESOLVED: [{ status: 'CLOSED', label: 'Fechar' }, { status: 'OPEN', label: 'Reabrir' }],
  CLOSED: [{ status: 'OPEN', label: 'Reabrir' }],
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const user = getUser();

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

  async function handleStatus(incident: Incident, status: string) {
    try {
      await api.patch(`/incidents/${incident.id}/status`, { status });
      load();
      setSelected(null);
      setDetail(null);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erro');
    }
  }

  const SEV_COLORS: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-green-100 text-green-800',
  };
  const SEV_LABELS: Record<string, string> = { CRITICAL: '🔴 Crítico', HIGH: '🟠 Alto', MEDIUM: '🟡 Médio', LOW: '🟢 Baixo' };

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
              <h3 className="font-bold text-gray-900 text-lg">{detail.title}</h3>
              <p className="text-sm text-slate-600 mt-1">{detail.description}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              <span>🏢 {detail.unit.name}</span>
              <span>👤 {detail.reporter.name}</span>
              <span>📅 {formatDateTime(detail.createdAt)}</span>
              {detail.resolvedAt && <span>✅ Resolvido em {formatDateTime(detail.resolvedAt)}</span>}
            </div>
            {detail.photoUrls?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">📷 Fotos ({detail.photoUrls.length})</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {detail.photoUrls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-32 object-cover rounded-xl border border-slate-100 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightbox(url)}
                    />
                  ))}
                </div>
              </div>
            )}
            {(STATUS_TRANSITIONS[detail.status] ?? []).length > 0 && (
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                {(STATUS_TRANSITIONS[detail.status] ?? []).map((t) => (
                  <button key={t.status} onClick={() => handleStatus(detail, t.status)}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-lg transition-colors">
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Ocorrências</h1>
          <p className="text-sm text-slate-500">{total} ocorrências registradas</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          + Registrar Ocorrência
        </button>
      </div>

      {/* Filtros de severidade */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-3 flex-wrap">
        {SEV_TABS.map((t) => (
          <button key={t.key} onClick={() => setSevFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${sevFilter === t.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : incidents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-lg font-semibold text-slate-700">Nenhum ocorrência registrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => {
            const transitions = STATUS_TRANSITIONS[inc.status] ?? [];
            return (
              <div key={inc.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setDetail(inc)}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${SEV_COLORS[inc.severity] ?? ''}`}>
                        {SEV_LABELS[inc.severity] ?? inc.severity}
                      </span>
                      <Badge value={inc.status} />
                      {inc.photoUrls?.length > 0 && (
                        <span className="text-xs text-slate-400">📷 {inc.photoUrls.length} foto(s)</span>
                      )}
                    </div>
                    <h3 className="font-bold text-gray-900">{inc.title}</h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{inc.description}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
                      <span>🏢 {inc.unit.name}</span>
                      <span>👤 {inc.reporter.name}</span>
                      <span>📅 {formatDateTime(inc.createdAt)}</span>
                      {inc.resolvedAt && <span>✅ Resolvido em {formatDateTime(inc.resolvedAt)}</span>}
                    </div>
                  </div>
                  {transitions.length > 0 && (
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {transitions.map((t) => (
                        <button key={t.status} onClick={() => handleStatus(inc, t.status)}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-lg transition-colors">
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Título *</label>
        <input required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          value={form.title} onChange={(e) => { setForm(f => ({ ...f, title: e.target.value })); setSuggestionDismissed(false); }}
          placeholder="ex: Vazamento na bomba hidráulica" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição *</label>
        <textarea required rows={4} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Unidade *</label>
          <select required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.unitId} onChange={(e) => setForm(f => ({ ...f, unitId: e.target.value }))}>
            <option value="">Selecione...</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Severidade</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
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
