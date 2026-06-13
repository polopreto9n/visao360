'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckSquare2,
  ClipboardCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  dashboardApi,
  DashboardPeriodParams,
  DashboardKPIs,
  Execution,
  MyActionsResult,
  UnitOption,
  UnitRankingItem,
  UnitRankingResult,
  unitsApi,
  WorkOrder,
} from '../../lib/api';
import { canManage, formatDate, formatDateTime, getUser } from '../../lib/auth';
import { Badge } from '../../components/ui/Badge';

const CHECKLIST_COLORS: Record<string, string> = {
  PREVENTIVE: '#2563EB',
  CORRECTIVE: '#EF4444',
  INSPECTION: '#10B981',
  AUDIT: '#F59E0B',
};

const CHECKLIST_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Corretivo',
  INSPECTION: 'Inspeção',
  AUDIT: 'Auditoria',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#2563EB',
  LOW: '#10B981',
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#2563EB',
  ASSIGNED: '#7C3AED',
  IN_PROGRESS: '#10B981',
  WAITING_PARTS: '#F59E0B',
  COMPLETED: '#0EA5E9',
  CANCELLED: '#94A3B8',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em andamento',
  WAITING_PARTS: 'Aguard. peças',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const STATUS_SEQUENCE = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED'];

type Trend = { pct: number; prev: number };
type WorkOrderChartPoint = { name: string; value: number; fill: string };
type PriorityPoint = { key: string; name: string; value: number; fill: string };
type ChecklistPoint = { name: string; value: number; fill: string };
type DashboardPeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const PERIOD_PRESETS: Array<{ value: DashboardPeriodPreset; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'month', label: 'Mês atual' },
  { value: 'custom', label: 'Personalizado' },
];

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateFromInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getInitialPeriodPreset(): DashboardPeriodPreset {
  if (typeof window === 'undefined') return 'month';

  const period = new URLSearchParams(window.location.search).get('period');
  return PERIOD_PRESETS.some((preset) => preset.value === period)
    ? (period as DashboardPeriodPreset)
    : 'month';
}

function getInitialCustomDate(key: 'startDate' | 'endDate', fallback: string) {
  if (typeof window === 'undefined') return fallback;

  const value = new URLSearchParams(window.location.search).get(key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function syncPeriodUrl(period: DashboardPeriodPreset, customFrom?: string, customTo?: string) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('period', period);

  if (period === 'custom' && customFrom && customTo) {
    url.searchParams.set('startDate', customFrom);
    url.searchParams.set('endDate', customTo);
  } else {
    url.searchParams.delete('startDate');
    url.searchParams.delete('endDate');
  }
  url.searchParams.delete('from');
  url.searchParams.delete('to');

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getInitialUnitId() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('unitId') ?? '';
}

function syncUnitUrl(unitId: string) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (unitId) {
    url.searchParams.set('unitId', unitId);
  } else {
    url.searchParams.delete('unitId');
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function buildPeriodParams(
  preset: DashboardPeriodPreset,
  customFrom: string,
  customTo: string,
): DashboardPeriodParams | null {
  if (preset !== 'custom') {
    return { period: preset };
  }

  const from = localDateFromInput(customFrom);
  const to = localDateFromInput(customTo);
  if (!from || !to || from.getTime() > to.getTime()) return null;

  return { period: 'custom', startDate: customFrom, endDate: customTo };
}

function describePeriod(
  preset: DashboardPeriodPreset,
  period: DashboardPeriodParams | null,
) {
  if (preset === 'today') return 'Indicadores de hoje';
  if (preset === '7d') return 'Indicadores dos últimos 7 dias';
  if (preset === '30d') return 'Indicadores dos últimos 30 dias';
  if (preset === 'month') return 'Indicadores do mês atual';
  if (!period) return 'Informe um intervalo válido';

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const from = period.startDate ? localDateFromInput(period.startDate) : null;
  const to = period.endDate ? localDateFromInput(period.endDate) : null;
  if (!from || !to) return 'Informe um intervalo válido';
  return `Indicadores de ${formatter.format(from)} a ${formatter.format(to)}`;
}

function pluralize(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function relativeTime(date: string) {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return formatDateTime(date);

  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  return formatDate(date);
}

function TrendLine({
  trend,
  positiveIsGood = true,
  fallback,
}: {
  trend?: Trend;
  positiveIsGood?: boolean;
  fallback: string;
}) {
  if (!trend || trend.prev === 0 || trend.pct === 0) {
    return <span className="text-[12px] font-medium text-slate-500">{fallback}</span>;
  }

  const up = trend.pct > 0;
  const good = up === positiveIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={14} strokeWidth={2.5} />
      {Math.abs(trend.pct)}% vs. período anterior
    </span>
  );
}

function AlertStrip({
  summary,
  overdueMaintenance,
}: {
  summary: DashboardKPIs['summary'];
  overdueMaintenance: number;
}) {
  const alerts = [
    {
      href: '/dashboard/work-orders',
      count: summary.overdueWorkOrders,
      label: `${pluralize(summary.overdueWorkOrders, 'OS vencida', 'OS vencidas')}`,
      icon: TriangleAlert,
      iconStyle: 'bg-red-500 text-white',
    },
    {
      href: '/dashboard/assets',
      count: overdueMaintenance,
      label: pluralize(overdueMaintenance, 'manutenção vencida', 'manutenções vencidas'),
      icon: CalendarClock,
      iconStyle: 'bg-orange-500 text-white',
    },
  ].filter((alert) => alert.count > 0);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="fluent-surface flex flex-col gap-2 rounded-[18px] p-2.5 md:flex-row md:items-center">
      {alerts.map(({ href, label, icon: Icon, iconStyle }) => (
        <Link
          key={label}
          href={href}
          className="fluent-control flex min-h-11 min-w-[192px] items-center gap-2.5 rounded-2xl px-3.5 text-[12px] font-semibold text-slate-900 transition-transform hover:-translate-y-0.5"
        >
          <span className={`flex h-5 w-5 items-center justify-center rounded-full ${iconStyle}`}>
            <Icon size={12} strokeWidth={2.7} />
          </span>
          <span className="min-w-0">{label}</span>
        </Link>
      ))}
      <Link
        href="/dashboard/alerts"
        className="fluent-control flex min-h-11 items-center justify-between gap-2.5 rounded-2xl px-3.5 text-[12px] font-semibold text-blue-700 transition-transform hover:-translate-y-0.5 md:ml-auto md:min-w-[190px]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
            <BadgeCheck size={12} strokeWidth={2.6} />
          </span>
          <span>Ver todos os alertas</span>
        </span>
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}

function KPICard({
  label,
  value,
  fallback,
  href,
  trend,
  positiveIsGood,
  icon: Icon,
  tileClassName,
}: {
  label: string;
  value: string | number;
  fallback: string;
  href: string;
  trend?: Trend;
  positiveIsGood?: boolean;
  icon: typeof Building2;
  tileClassName: string;
}) {
  return (
    <Link
      href={href}
      className="fluent-surface group flex min-h-[90px] items-start justify-between rounded-[18px] p-3.5 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[12px] font-medium text-slate-600">{label}</p>
        <p className="mt-1 text-[28px] font-extrabold leading-none tracking-normal text-slate-950">{value}</p>
        <div className="mt-auto pt-1.5">
          <TrendLine trend={trend} positiveIsGood={positiveIsGood} fallback={fallback} />
        </div>
      </div>
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 ${tileClassName}`}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
    </Link>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="fluent-surface rounded-2xl px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="font-extrabold text-blue-700">{payload[0].value}</p>
    </div>
  );
}

function ServiceOrdersChart({ data, total }: { data: WorkOrderChartPoint[]; total: number }) {
  return (
    <section className="fluent-surface flex h-full min-h-[360px] flex-col rounded-[18px] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-950">Ordens de Serviço</h2>
          <p className="mt-1 text-[12px] text-slate-500">{total} ordens no período, distribuídas por status</p>
        </div>
        <span className="fluent-control inline-flex h-9 items-center rounded-2xl px-3 text-[11px] font-semibold text-slate-700">
          Visão do período
        </span>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-[270px] flex-1 items-center justify-center rounded-2xl border border-dashed border-blue-100 bg-white/40 text-sm text-slate-500">
          Nenhuma ordem de serviço cadastrada.
        </div>
      ) : (
        <div className="min-h-[270px] w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="serviceOrdersArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#52627A', fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#52627A', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                name="Ordens"
                stroke="#2563EB"
                strokeWidth={3}
                fill="url(#serviceOrdersArea)"
                activeDot={{ r: 5, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
                dot={{ r: 4, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-center gap-4 border-t border-blue-100/80 pt-2.5">
        {data.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
            {item.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function MaintenancePanel({ assets }: { assets: DashboardKPIs['alerts']['assetsNeedingMaintenance'] }) {
  return (
    <section className="fluent-surface flex min-h-[320px] flex-col rounded-[18px]">
      <div className="border-b border-blue-100/80 px-4 py-3.5">
        <h2 className="text-[15px] font-extrabold text-slate-950">Manutenções no Período</h2>
      </div>

      {assets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <ShieldCheck className="text-emerald-500" size={28} />
          <p className="text-sm font-semibold text-slate-700">Tudo em dia</p>
          <p className="text-[12px] text-slate-500">Nenhuma manutenção programada no período selecionado.</p>
        </div>
      ) : (
        <div className="flex-1 px-4">
          {assets.slice(0, 4).map((asset) => (
            <Link
              key={asset.id}
              href={`/dashboard/assets/${asset.id}`}
              className="flex items-center gap-3 border-b border-blue-100/70 py-2.5 transition-colors last:border-b-0 hover:text-blue-700"
            >
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${asset.isOverdue ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                <CalendarClock size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-950">{asset.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{asset.unit.name}</span>
              </span>
              <span className={`text-right text-[11px] font-bold ${asset.isOverdue ? 'text-red-600' : 'text-slate-600'}`}>
                {formatDate(asset.nextMaintenanceAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link href="/dashboard/assets" className="flex items-center justify-between border-t border-blue-100/80 px-4 py-3 text-[12px] font-bold text-blue-700">
        Ver todas as manutenções
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}

function PriorityDonut({ data }: { data: PriorityPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <section className="fluent-surface rounded-[18px] p-5">
      <h2 className="text-[14px] font-extrabold text-slate-950">OS por Prioridade</h2>
      {data.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-slate-500">Nenhuma OS em aberto.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
            <div className="h-[126px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" innerRadius={39} outerRadius={58} paddingAngle={1} stroke="rgba(255,255,255,0.75)">
                    {data.map((item) => (
                      <Cell key={item.key} fill={item.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {data.map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-[12px] text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="flex-1">{item.name}</span>
                  <span className="font-extrabold text-slate-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-blue-100/80 pt-3 text-[12px]">
            <span className="font-semibold text-slate-600">Total</span>
            <span className="font-extrabold text-slate-950">{total}</span>
          </div>
        </>
      )}
    </section>
  );
}

function ChecklistTypeBars({ data }: { data: ChecklistPoint[] }) {
  const total = Math.max(data.reduce((sum, item) => sum + item.value, 0), 1);

  return (
    <section className="fluent-surface rounded-[18px] p-5">
      <h2 className="text-[14px] font-extrabold text-slate-950">Checklists por Tipo</h2>
      {data.length === 0 ? (
        <p className="py-7 text-center text-[12px] text-slate-500">Nenhuma execução no período selecionado.</p>
      ) : (
        <div className="mt-4 space-y-3.5">
          {data.map((item) => {
            const share = Math.round((item.value / total) * 100);
            return (
              <div key={item.name} className="grid grid-cols-[88px_minmax(0,1fr)_36px] items-center gap-3 text-[12px]">
                <span className="truncate font-medium text-slate-600">{item.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-blue-100/70">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: item.fill }}
                  />
                </span>
                <span className="text-right font-extrabold text-slate-900">{item.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function rankingRate(value: number | null) {
  return value === null ? 'Sem base' : `${value}%`;
}

function RankingColumn({
  title,
  items,
  scoreClassName,
}: {
  title: string;
  items: UnitRankingItem[];
  scoreClassName: string;
}) {
  return (
    <section className="rounded-[18px] border border-blue-100/80 bg-white/45">
      <div className="border-b border-blue-100/80 px-4 py-3">
        <h3 className="text-[14px] font-extrabold text-slate-950">{title}</h3>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] font-medium text-slate-500">
          Dados insuficientes para classificar.
        </p>
      ) : (
        <div className="divide-y divide-blue-100/70">
          {items.map((unit, index) => (
            <div key={unit.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100/80 text-[12px] font-extrabold text-blue-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-extrabold text-slate-950">{unit.name}</p>
                  {unit.code && <span className="text-[11px] font-semibold text-slate-500">{unit.code}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">
                    Confiança {unit.confidence.toLowerCase()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
                  <span className="rounded-full bg-white/80 px-2 py-1">
                    Conformidade {rankingRate(unit.indicators.conformityRate)}
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-1">
                    SLA {rankingRate(unit.indicators.slaRate)}
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-1">
                    {unit.indicators.overdueWorkOrders} OS vencidas
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-1">
                    {unit.indicators.incidents} ocorrências
                  </span>
                </div>
              </div>
              <div className={`inline-flex h-14 min-w-16 flex-col items-center justify-center rounded-2xl px-3 ${scoreClassName}`}>
                <span className="text-[22px] font-black leading-none">{unit.score}</span>
                <span className="text-[10px] font-extrabold uppercase">pontos</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UnitRankingPanel({ period }: { period: DashboardPeriodParams }) {
  const [data, setData] = useState<UnitRankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    dashboardApi.unitRanking(period)
      .then((response) => {
        setData(response.data);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading || error || !data || data.totals.eligibleUnits < 3) {
    return null;
  }

  return (
    <section className="fluent-surface rounded-[18px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-blue-100/80 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-blue-700">Analytics operacional</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-slate-950">Ranking de Condomínios</h2>
          <p className="mt-1 max-w-2xl text-[11px] font-medium text-slate-500">
            Score geral do período: conformidade 30%, SLA 25%, saúde das OS 20%, ocorrências 15% e preventiva 10%.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-slate-600">
          <span className="rounded-2xl bg-white/75 px-2.5 py-1.5">
            <strong className="block text-[15px] text-slate-950">{data.totals.comparedUnits}</strong>
            Comparados
          </span>
          <span className="rounded-2xl bg-white/75 px-2.5 py-1.5">
            <strong className="block text-[15px] text-emerald-700">{data.totals.eligibleUnits}</strong>
            Elegíveis
          </span>
          <span className="rounded-2xl bg-white/75 px-2.5 py-1.5">
            <strong className="block text-[15px] text-amber-700">{data.totals.insufficientDataUnits}</strong>
            Sem base
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <RankingColumn
          title="Top 5 melhores"
          items={data.best}
          scoreClassName="bg-emerald-100 text-emerald-700"
        />
        <RankingColumn
          title="Top 5 piores"
          items={data.worst}
          scoreClassName="bg-red-100 text-red-700"
        />
      </div>
    </section>
  );
}

function ProximasAcoes({ period }: { period: DashboardPeriodParams }) {
  const [data, setData] = useState<MyActionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    dashboardApi.myActions(period)
      .then((response) => setData(response.data))
      .catch(() => setData({ dueSchedules: [], urgentWorkOrders: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [period]);

  const now = new Date();

  return (
    <section className="fluent-surface flex min-h-[320px] flex-col rounded-[18px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold text-slate-950">Próximas Ações</h2>
        {!!data?.total && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{data.total}</span>}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => <div key={item} className="skeleton h-14 rounded-2xl" />)}
        </div>
      ) : !data || data.total === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
          <ShieldCheck className="text-emerald-500" size={28} />
          <p className="text-sm font-semibold text-slate-700">Nenhuma tarefa pendente no período.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.dueSchedules.map((schedule) => {
            const overdue = new Date(schedule.nextDueAt) < now;
            return (
              <Link
                key={schedule.id}
                href="/dashboard/checklists"
                className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-white/70 ${
                  overdue ? 'border-red-100 bg-red-50/80' : 'border-blue-100 bg-white/45'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${overdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
                  <ClipboardCheck size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-slate-950">{schedule.checklist.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{schedule.asset?.name ?? 'Sem equipamento'}</span>
                </span>
                <span className={`text-[11px] font-extrabold ${overdue ? 'text-red-600' : 'text-blue-700'}`}>
                  {overdue ? 'Atrasado' : formatDate(schedule.nextDueAt)}
                </span>
              </Link>
            );
          })}

          {data.urgentWorkOrders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/work-orders/${order.id}`}
              className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white/45 p-3 transition-colors hover:bg-white/70"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Wrench size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-950">{order.title}</span>
                <span className="block truncate text-[11px] text-slate-500">{order.unit.name}</span>
              </span>
              <Badge value={order.priority} type="priority" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [periodPreset, setPeriodPreset] = useState<DashboardPeriodPreset>(getInitialPeriodPreset);
  const [customFrom, setCustomFrom] = useState(() => {
    const now = new Date();
    const fallback = getInitialPeriodPreset() === 'custom'
      ? ''
      : dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
    return getInitialCustomDate('startDate', fallback);
  });
  const [customTo, setCustomTo] = useState(() => {
    const fallback = getInitialPeriodPreset() === 'custom' ? '' : dateInputValue(new Date());
    return getInitialCustomDate('endDate', fallback);
  });
  const [selectedUnitId, setSelectedUnitId] = useState(getInitialUnitId);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [unitOptionsLoading, setUnitOptionsLoading] = useState(true);
  const [unitOptionsError, setUnitOptionsError] = useState(false);
  const user = getUser();
  const role = user?.role ?? '';
  const isAdminDashboard = role === 'OWNER' || role === 'ADMIN';
  const isGestor = role === 'GESTOR';
  const isTecnico = role === 'TECNICO';
  const isCliente = role === 'CLIENTE';
  const isManager = canManage(role);
  const canSelectUnit = isAdminDashboard || isGestor;
  const selectedPeriod = useMemo(
    () => buildPeriodParams(periodPreset, customFrom, customTo),
    [customFrom, customTo, periodPreset],
  );
  const customPeriodError = periodPreset === 'custom' && !selectedPeriod
    ? !customFrom || !customTo
      ? 'Informe a data inicial e a data final.'
      : 'A data inicial deve ser anterior à data final.'
    : '';
  const dashboardFilters = useMemo(
    () => selectedPeriod
      ? { ...selectedPeriod, ...(canSelectUnit && selectedUnitId ? { unitId: selectedUnitId } : {}) }
      : null,
    [canSelectUnit, selectedPeriod, selectedUnitId],
  );
  const selectedUnit = useMemo(
    () => unitOptions.find((unit) => unit.id === selectedUnitId),
    [selectedUnitId, unitOptions],
  );
  const periodDescription = describePeriod(periodPreset, selectedPeriod);
  const assignedScopeDescription = unitOptions.length === 1
    ? unitOptions[0].name
    : `${unitOptions.length || 'seus'} condomínios atribuídos`;
  const scopeDescription = canSelectUnit && selectedUnitId
    ? `Indicadores do Condomínio ${selectedUnit?.name ?? 'selecionado'}`
    : isAdminDashboard
      ? 'Indicadores Globais'
      : isGestor
        ? 'Indicadores da sua carteira de condomínios'
        : isTecnico
          ? 'Tarefas e atividades atribuídas a você'
          : `Indicadores do seu condomínio: ${assignedScopeDescription}`;

  const load = useCallback(async () => {
    if (!dashboardFilters) {
      setLoading(false);
      return;
    }

    try {
      setLoadError(false);
      const response = await dashboardApi.kpis(dashboardFilters);
      setKpis(response.data);
      setLastUpdate(new Date());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [dashboardFilters]);

  useEffect(() => {
    setLoading(true);
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setUnitOptionsLoading(true);
    unitsApi.options()
      .then((response) => {
        setUnitOptions(response.data);
        setUnitOptionsError(false);
      })
      .catch(() => setUnitOptionsError(true))
      .finally(() => setUnitOptionsLoading(false));
  }, []);

  const selectPeriodPreset = (nextPreset: DashboardPeriodPreset) => {
    setPeriodPreset(nextPreset);
    syncPeriodUrl(nextPreset, customFrom, customTo);
  };

  const changeCustomDate = (key: 'from' | 'to', value: string) => {
    setPeriodPreset('custom');
    if (key === 'from') {
      setCustomFrom(value);
      syncPeriodUrl('custom', value, customTo);
      return;
    }

    setCustomTo(value);
    syncPeriodUrl('custom', customFrom, value);
  };

  const selectUnit = (unitId: string) => {
    setSelectedUnitId(unitId);
    syncUnitUrl(unitId);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!kpis) {
    return (
      <div className="fluent-surface mx-auto mt-20 max-w-xl rounded-[18px] p-6 text-center">
        <p className="text-sm font-semibold text-slate-900">
          {dashboardFilters ? 'Erro ao carregar dados do dashboard.' : 'Período personalizado inválido.'}
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          {dashboardFilters
            ? 'Tente atualizar novamente em instantes.'
            : customPeriodError || 'Selecione um período válido.'}
        </p>
        {dashboardFilters && (
          <button
            type="button"
            onClick={load}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  const { summary, charts, recentActivity, alerts } = kpis;
  const trends = summary.trends;
  const overdueMaintenance = alerts.assetsNeedingMaintenance.filter((asset) => asset.isOverdue).length;
  const workOrderChartData: WorkOrderChartPoint[] = STATUS_SEQUENCE
    .map((status) => {
      const source = charts.woByStatus.find((item) => item.status === status);
      return {
        name: STATUS_LABELS[status] ?? status,
        value: source?.count ?? 0,
        fill: STATUS_COLORS[status] ?? '#94A3B8',
      };
    })
    .filter((item) => item.value > 0);
  const priorityData: PriorityPoint[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
    .map((priority) => {
      const source = charts.woByPriority.find((item) => item.priority === priority);
      return {
        key: priority,
        name: PRIORITY_LABELS[priority],
        value: source?.count ?? 0,
        fill: PRIORITY_COLORS[priority],
      };
    })
    .filter((item) => item.value > 0);
  const checklistTypeData: ChecklistPoint[] = (charts.checklistsByType ?? []).map((item) => ({
    name: CHECKLIST_LABELS[item.type] ?? item.type,
    value: item.count,
    fill: CHECKLIST_COLORS[item.type] ?? '#64748B',
  }));

  return (
    <div className="space-y-3 pb-1 sm:space-y-4">
      <section className="fluent-surface flex flex-col gap-3 rounded-[18px] p-3 lg:flex-row lg:items-center">
        <div className="min-w-0 lg:w-[228px] lg:flex-shrink-0">
          <p className="text-[11px] font-bold uppercase text-blue-700">Escopo atual</p>
          <p className="mt-0.5 truncate text-[13px] font-extrabold text-slate-950">{scopeDescription}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
            {periodDescription} · atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="min-w-0 lg:w-[248px] lg:flex-shrink-0">
          {canSelectUnit ? (
            <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
              Condomínio
              <select
                value={selectedUnitId}
                onChange={(event) => selectUnit(event.target.value)}
                disabled={unitOptionsLoading}
                className="fluent-control h-9 min-w-0 rounded-2xl px-3 text-[12px] font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-wait disabled:opacity-70"
              >
                {isGestor && <option value="">Todos sob minha responsabilidade</option>}
                {!isGestor && <option value="">Todos os condomínios</option>}
                {selectedUnitId && !selectedUnit && (
                  <option value={selectedUnitId}>Condomínio selecionado</option>
                )}
                {unitOptions.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? `${unit.name} - ${unit.code}` : unit.name}
                  </option>
                ))}
              </select>
              {unitOptionsError && (
                <span className="text-[11px] font-medium text-red-600">
                  Não foi possível carregar condomínios agora.
                </span>
              )}
            </label>
          ) : (
            <div className="fluent-control rounded-2xl px-3 py-2">
              <p className="text-[11px] font-bold uppercase text-blue-700">
                {isTecnico ? 'Escopo pessoal' : 'Escopo restrito'}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                {isTecnico
                  ? 'Apenas tarefas vinculadas ao seu usuário.'
                  : 'Indicadores limitados ao seu acesso.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[11px] font-bold uppercase text-blue-700">Período global</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIOD_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => selectPeriodPreset(preset.value)}
                aria-pressed={periodPreset === preset.value}
                className={`inline-flex h-9 items-center justify-center rounded-2xl border px-3 text-[11px] font-bold transition-colors ${
                  periodPreset === preset.value
                    ? 'border-blue-200 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)]'
                    : 'border-blue-100 bg-white/55 text-slate-700 hover:border-blue-200 hover:bg-white/80'
                }`}
              >
                {preset.label}
              </button>
            ))}

            {periodPreset === 'custom' && (
              <>
                <label className="inline-flex h-9 items-center gap-1 rounded-2xl border border-blue-100 bg-white/55 px-2 text-[11px] font-semibold text-slate-600">
                  De
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(event) => changeCustomDate('from', event.target.value)}
                    className="h-7 min-w-[118px] bg-transparent text-[11px] font-bold text-slate-900 outline-none"
                  />
                </label>
                <label className="inline-flex h-9 items-center gap-1 rounded-2xl border border-blue-100 bg-white/55 px-2 text-[11px] font-semibold text-slate-600">
                  Até
                  <input
                    type="date"
                    value={customTo}
                    onChange={(event) => changeCustomDate('to', event.target.value)}
                    className="h-7 min-w-[118px] bg-transparent text-[11px] font-bold text-slate-900 outline-none"
                  />
                </label>
              </>
            )}
          </div>

          {periodPreset === 'custom' && !selectedPeriod && (
            <span className="text-[11px] font-semibold text-red-600">
              {customPeriodError || 'Informe um intervalo válido.'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:flex-shrink-0">
          <button
            onClick={load}
            className="fluent-control inline-flex h-9 items-center gap-2 rounded-2xl px-3.5 text-[12px] font-bold text-slate-900 transition-transform hover:-translate-y-0.5"
          >
            <RefreshCw size={15} />
            Atualizar
          </button>
          {isManager && (
            <Link
              href="/dashboard/work-orders"
              className="inline-flex h-9 items-center gap-2 rounded-2xl bg-blue-600 px-3.5 text-[12px] font-bold text-white shadow-[0_14px_28px_rgba(37,99,235,0.22)] transition-colors hover:bg-blue-700"
            >
              <Plus size={16} />
              Nova OS
            </Link>
          )}
        </div>
      </section>

      {loadError && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-[13px] font-semibold text-red-700">
          Não foi possível atualizar o período agora. Os últimos dados carregados continuam visíveis.
        </div>
      )}

      {!isTecnico && (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KPICard
          label="Equipamentos Ativos"
          value={summary.activeAssets}
          fallback={`${summary.assetsInMaintenance} em manutenção`}
          href="/dashboard/assets"
          icon={Building2}
          tileClassName="bg-indigo-100 text-indigo-600"
        />
        <KPICard
          label="Checklists (Período)"
          value={summary.checklistsThisMonth}
          fallback="Execuções registradas no período"
          href="/dashboard/checklists"
          trend={trends?.checklistsThisMonth}
          icon={CheckSquare2}
          tileClassName="bg-emerald-100 text-emerald-600"
        />
        <KPICard
          label="OS em Aberto"
          value={summary.openWorkOrders}
          fallback={`${summary.inProgressWorkOrders} em andamento`}
          href="/dashboard/work-orders"
          trend={trends?.newWorkOrders}
          positiveIsGood={false}
          icon={ClipboardCheck}
          tileClassName="bg-orange-100 text-orange-600"
        />
        <KPICard
          label="SLA / Conformidade"
          value={`${summary.checklistCompletionRate}%`}
          fallback="Taxa de checklists concluídos"
          href="/dashboard/checklists"
          trend={trends?.checklistCompletionRate}
          icon={ShieldCheck}
          tileClassName="bg-amber-100 text-amber-500"
        />
        <KPICard
          label="Gasto com Manutenção"
          value={summary.maintenanceCostThisMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          fallback="Custo de OS concluídas no período"
          href="/dashboard/work-orders"
          trend={trends?.maintenanceCost}
          positiveIsGood={false}
          icon={Wallet}
          tileClassName="bg-rose-100 text-rose-600"
        />
      </section>
      )}

      {!isTecnico && <AlertStrip summary={summary} overdueMaintenance={overdueMaintenance} />}

      {isManager && (
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.72fr)]">
          <ServiceOrdersChart data={workOrderChartData} total={summary.totalWorkOrders} />

          <div className="grid gap-3">
            <PriorityDonut data={priorityData} />
            <ChecklistTypeBars data={checklistTypeData} />
          </div>
        </section>
      )}

      {isManager && (
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.94fr)_minmax(320px,0.94fr)]">
          <section className="fluent-surface flex min-h-[320px] flex-col rounded-[18px]">
            <div className="border-b border-blue-100/80 px-4 py-3.5">
              <h2 className="text-[15px] font-extrabold text-slate-950">Atividades Recentes</h2>
            </div>
            <div className="flex-1 px-4">
              <RecentActivity
                executions={recentActivity.executions}
                completedWorkOrders={recentActivity.completedWorkOrders ?? []}
                workOrders={recentActivity.workOrders}
              />
            </div>
            <Link href="/dashboard/work-orders" className="flex items-center justify-between border-t border-blue-100/80 px-4 py-3 text-[12px] font-bold text-blue-700">
              Ver todas as atividades
              <ArrowRight size={15} />
            </Link>
          </section>

          <MaintenancePanel assets={alerts.assetsNeedingMaintenance} />

          {dashboardFilters && <ProximasAcoes period={dashboardFilters} />}
        </section>
      )}

      {isManager && selectedPeriod && !selectedUnitId && <UnitRankingPanel period={selectedPeriod} />}

      {isTecnico && (
        <section className="grid gap-3 lg:grid-cols-2">
          {dashboardFilters && <ProximasAcoes period={dashboardFilters} />}
          <section className="fluent-surface rounded-[18px] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-slate-950">Minhas atividades recentes</h2>
              <Link href="/dashboard/checklists" className="inline-flex items-center gap-1 text-[12px] font-bold text-blue-700">
                Ver checklists
                <ArrowRight size={14} />
              </Link>
            </div>
            <RecentActivity
              executions={recentActivity.executions}
              completedWorkOrders={recentActivity.completedWorkOrders ?? []}
              workOrders={recentActivity.workOrders}
            />
          </section>
        </section>
      )}

      {isCliente && (
        <section className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <MaintenancePanel assets={alerts.assetsNeedingMaintenance} />
          <section className="fluent-surface rounded-[18px] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-slate-950">Atividades do condomínio</h2>
              <Link href="/dashboard/checklists" className="inline-flex items-center gap-1 text-[12px] font-bold text-blue-700">
                Ver checklists
                <ArrowRight size={14} />
              </Link>
            </div>
            <RecentActivity
              executions={recentActivity.executions}
              completedWorkOrders={recentActivity.completedWorkOrders ?? []}
              workOrders={recentActivity.workOrders}
            />
          </section>
        </section>
      )}
    </div>
  );
}

function RecentActivity({
  executions,
  completedWorkOrders,
  workOrders,
}: {
  executions: Execution[];
  completedWorkOrders: WorkOrder[];
  workOrders: WorkOrder[];
}) {
  type Item = { kind: 'execution' | 'workorder'; date: string; data: Execution | WorkOrder };

  const items: Item[] = [
    ...executions.map((execution) => ({
      kind: 'execution' as const,
      date: execution.completedAt ?? execution.startedAt ?? execution.createdAt,
      data: execution,
    })),
    ...completedWorkOrders.map((order) => ({
      kind: 'workorder' as const,
      date: order.completedAt ?? order.updatedAt ?? order.createdAt,
      data: order,
    })),
    ...workOrders.slice(0, 3).map((order) => ({
      kind: 'workorder' as const,
      date: order.createdAt,
      data: order,
    })),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);

  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-500">Nenhuma atividade registrada.</p>;
  }

  return (
    <div>
      {items.map((item, index) => {
        if (item.kind === 'execution') {
          const execution = item.data as Execution;
          return (
            <Link
              key={`execution-${execution.id}-${index}`}
              href={`/dashboard/executions/${execution.id}`}
              className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-blue-100/70 py-3 last:border-b-0"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <ClipboardCheck size={18} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-slate-950">{execution.checklist.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{execution.user.name}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="text-[11px] font-semibold text-slate-500">{relativeTime(item.date)}</span>
                <Badge value={execution.status} />
              </span>
            </Link>
          );
        }

        const order = item.data as WorkOrder;
        return (
          <Link
            key={`work-order-${order.id}-${index}`}
            href={`/dashboard/work-orders/${order.id}`}
            className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-blue-100/70 py-3 last:border-b-0"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Wrench size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-slate-950">{order.title}</span>
              <span className="block truncate text-[11px] text-slate-500">{order.unit?.name ?? ''}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="text-[11px] font-semibold text-slate-500">{relativeTime(item.date)}</span>
              <Badge value={order.status} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
