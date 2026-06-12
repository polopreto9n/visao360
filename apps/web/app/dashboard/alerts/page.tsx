'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCheck,
  ClipboardCheck,
  Info,
  Search,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { alertsApi, AlertsResult, AlertSeverity, OperationalAlert } from '../../../lib/api';
import { formatDateTime } from '../../../lib/auth';

const SEVERITIES: Array<{
  value: '' | AlertSeverity;
  label: string;
  tone: string;
  icon: typeof TriangleAlert;
}> = [
  { value: '', label: 'Todos', tone: 'bg-blue-100 text-blue-700', icon: BellRing },
  { value: 'CRITICO', label: 'Crítico', tone: 'bg-red-100 text-red-700', icon: ShieldAlert },
  { value: 'ALTO', label: 'Alto', tone: 'bg-orange-100 text-orange-700', icon: TriangleAlert },
  { value: 'MEDIO', label: 'Médio', tone: 'bg-amber-100 text-amber-700', icon: ClipboardCheck },
  { value: 'INFORMATIVO', label: 'Informativo', tone: 'bg-sky-100 text-sky-700', icon: Info },
];

const SEVERITY_META: Record<AlertSeverity, { label: string; badge: string; rail: string }> = {
  CRITICO: { label: 'Crítico', badge: 'bg-red-100 text-red-700', rail: 'bg-red-500' },
  ALTO: { label: 'Alto', badge: 'bg-orange-100 text-orange-700', rail: 'bg-orange-500' },
  MEDIO: { label: 'Médio', badge: 'bg-amber-100 text-amber-700', rail: 'bg-amber-500' },
  INFORMATIVO: { label: 'Informativo', badge: 'bg-sky-100 text-sky-700', rail: 'bg-sky-500' },
};

const SOURCE_LABELS: Record<OperationalAlert['source'], string> = {
  WORK_ORDER_OVERDUE: 'Ordem de serviço',
  MAINTENANCE_OVERDUE: 'Manutenção',
  CHECKLIST_OVERDUE: 'Checklist',
  ASSET_WITHOUT_INSPECTION: 'Equipamento',
  INCIDENT_OPEN: 'Ocorrência',
};

function AlertRow({
  alert,
  marking,
  onMarkRead,
}: {
  alert: OperationalAlert;
  marking: boolean;
  onMarkRead: (alert: OperationalAlert) => void;
}) {
  const meta = SEVERITY_META[alert.severity];

  return (
    <article className="fluent-surface group relative overflow-hidden rounded-[18px] p-4 sm:p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${meta.rail}`} />
      <div className="flex flex-col gap-4 pl-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`fluent-badge ${meta.badge}`}>{meta.label}</span>
            <span className="fluent-badge bg-white/75 text-slate-600">{SOURCE_LABELS[alert.source]}</span>
            <span className={`fluent-badge ${alert.isRead ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>
              {alert.isRead ? 'Lido' : 'Não lido'}
            </span>
          </div>
          <h2 className="mt-3 text-[15px] font-extrabold text-slate-950">{alert.title}</h2>
          <p className="mt-1 text-[13px] font-medium text-slate-600">{alert.body}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
            <span>{alert.unit?.name ?? 'Escopo geral'}</span>
            <span>{formatDateTime(alert.occurredAt)}</span>
            {alert.readAt && <span>Lido em {formatDateTime(alert.readAt)}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {!alert.isRead && (
            <button
              type="button"
              onClick={() => onMarkRead(alert)}
              disabled={marking}
              className="fluent-button fluent-button-secondary h-10 gap-2 px-3 text-[12px]"
            >
              <CheckCheck size={15} />
              {marking ? 'Salvando...' : 'Marcar como lido'}
            </button>
          )}
          <Link
            href={alert.href}
            className="fluent-button fluent-button-primary h-10 gap-2 px-3 text-[12px]"
          >
            Ir para origem
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function AlertsPage() {
  const [result, setResult] = useState<AlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [severity, setSeverity] = useState<'' | AlertSeverity>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [marking, setMarking] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await alertsApi.list({
        page,
        limit: 20,
        ...(severity ? { severity } : {}),
        ...(unreadOnly ? { unreadOnly: true } : {}),
        ...(search ? { search } : {}),
      });
      setResult(response.data);
      setLoadError(false);
    } catch (error) {
      console.error('Falha ao carregar a central de alertas:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, search, severity, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  function chooseSeverity(next: '' | AlertSeverity) {
    setPage(1);
    setSeverity(next);
  }

  async function markRead(alert: OperationalAlert) {
    setMarking(alert.fingerprint);
    setActionError('');
    try {
      await alertsApi.markRead(alert.fingerprint);
      await load();
    } catch (error) {
      console.error('Falha ao marcar alerta como lido:', error);
      setActionError('Não foi possível marcar o alerta como lido agora.');
    } finally {
      setMarking('');
    }
  }

  const summary = result?.summary;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase text-blue-700">Central Inteligente</p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Alertas operacionais</h1>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Riscos atuais do condomínio reunidos por severidade, leitura e origem.
          </p>
        </div>

        <form onSubmit={submitSearch} className="fluent-control flex h-12 w-full items-center gap-2 rounded-2xl px-3 xl:max-w-md">
          <Search size={17} className="text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar alerta, condomínio ou origem..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button type="submit" className="fluent-button fluent-button-secondary h-9 px-3 text-xs">
            Buscar
          </button>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SEVERITIES.slice(1).map(({ value, label, tone, icon: Icon }) => {
          const metricSeverity = value as AlertSeverity;
          return (
          <button
            key={value}
            type="button"
            onClick={() => chooseSeverity(metricSeverity)}
            className={`fluent-surface flex min-h-[92px] items-center justify-between rounded-[18px] p-4 text-left transition-transform hover:-translate-y-0.5 ${
              severity === value ? 'ring-2 ring-blue-500/60' : ''
            }`}
          >
            <span>
              <span className="block text-[12px] font-bold text-slate-500">{label}</span>
              <strong className="mt-1 block text-2xl font-black text-slate-950">
                {summary?.bySeverity[metricSeverity] ?? 0}
              </strong>
            </span>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
              <Icon size={20} />
            </span>
          </button>
          );
        })}
      </section>

      <section className="fluent-surface rounded-[20px] p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-blue-100/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="fluent-filter-bar flex-wrap !gap-1 !p-1.5">
            {SEVERITIES.map(({ value, label }) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => chooseSeverity(value)}
                className={`fluent-filter-chip ${severity === value ? 'fluent-filter-chip-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="fluent-control inline-flex h-11 cursor-pointer items-center gap-3 rounded-2xl px-3 text-[13px] font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                setPage(1);
                setUnreadOnly(event.target.checked);
              }}
              className="h-4 w-4 accent-blue-600"
            />
            Somente não lidos
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">
              {summary?.unread ?? 0}
            </span>
          </label>
        </div>

        {actionError && (
          <div role="alert" className="mt-4 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-36 rounded-[18px]" />)}
          </div>
        ) : loadError ? (
          <div className="mt-4 flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-red-100 bg-red-50/70 p-5 text-center">
            <TriangleAlert className="text-red-500" size={28} />
            <h2 className="mt-3 text-base font-extrabold text-slate-950">Não foi possível carregar os alertas</h2>
            <p className="mt-1 text-sm font-medium text-slate-600">Tente novamente em alguns instantes.</p>
            <button type="button" onClick={() => void load()} className="fluent-button fluent-button-secondary mt-4 h-10 px-4 text-sm">
              Tentar novamente
            </button>
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="mt-4 flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-blue-100 bg-white/45 p-5 text-center">
            <BellRing className="text-emerald-500" size={30} />
            <h2 className="mt-3 text-base font-extrabold text-slate-950">Nenhum alerta neste filtro</h2>
            <p className="mt-1 max-w-md text-sm font-medium text-slate-500">
              A central mostra os riscos operacionais atuais. Ajuste a busca ou a severidade para ampliar o escopo.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {result.data.map((alert) => (
              <AlertRow
                key={alert.fingerprint}
                alert={alert}
                marking={marking === alert.fingerprint}
                onMarkRead={markRead}
              />
            ))}
          </div>
        )}

        {!!result && result.totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100/80 pt-4 text-sm font-semibold text-slate-600">
            <span>
              Página {result.page} de {result.totalPages} · {result.total} alerta(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={result.page <= 1}
                className="fluent-button fluent-button-secondary h-10 px-3 text-xs"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(result.totalPages, current + 1))}
                disabled={result.page >= result.totalPages}
                className="fluent-button fluent-button-secondary h-10 px-3 text-xs"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="fluent-surface-soft flex flex-col gap-3 rounded-[18px] p-4 text-sm font-medium text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Total atual: <strong className="text-slate-950">{summary?.total ?? 0}</strong> alerta(s)
        </span>
        <Link href="/dashboard/work-orders" className="inline-flex items-center gap-2 font-bold text-blue-700">
          Revisar ordens de serviço
          <Wrench size={15} />
        </Link>
      </section>
    </div>
  );
}
