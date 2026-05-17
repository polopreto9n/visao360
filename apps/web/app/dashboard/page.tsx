'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { dashboardApi, DashboardKPIs, workOrdersApi, WorkOrder, Execution } from '../../lib/api';
import { formatDate, formatDateTime, isOverdue, getUser } from '../../lib/auth';
import { Badge } from '../../components/ui/Badge';

// ─── Palettes ─────────────────────────────────────────────────────────────────

const CHECKLIST_COLORS: Record<string, string> = {
  PREVENTIVE: '#2563eb', CORRECTIVE: '#dc2626', INSPECTION: '#16a34a', AUDIT: '#d97706',
};
const CHECKLIST_LABELS: Record<string, string> = {
  PREVENTIVE: 'Preventivo', CORRECTIVE: 'Corretivo', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
};
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#16a34a',
};
const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa',
};
const STATUS_BAR_COLORS: Record<string, string> = {
  OPEN: '#3b82f6', ASSIGNED: '#8b5cf6', IN_PROGRESS: '#f59e0b',
  WAITING_PARTS: '#f97316', COMPLETED: '#10b981', CANCELLED: '#94a3b8',
};
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta', ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento',
  WAITING_PARTS: 'Aguard. peças', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon, accent, href }: {
  label: string; value: number | string; sub?: string;
  icon: string; accent: string; href?: string;
}) {
  const card = (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
          <p className={`text-4xl font-black mt-2 ${accent}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-slate-50 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
      <span className="text-red-500 text-xl">🚨</span>
      <p className="text-sm font-semibold text-red-700">{count} {label}</p>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-blue-600 font-bold">{payload[0].value}</p>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const user = getUser();

  const load = useCallback(async () => {
    try {
      const res = await dashboardApi.kpis();
      setKpis(res.data);
      setLastUpdate(new Date());
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!kpis) return <p className="text-slate-500 text-center mt-20">Erro ao carregar dados.</p>;

  const { summary, charts, recentActivity, alerts } = kpis;

  // Dados para gráficos
  const woStatusData = (charts.woByStatus ?? []).map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: s.count,
    fill: STATUS_BAR_COLORS[s.status] ?? '#94a3b8',
  }));

  const checklistTypeData = (charts.checklistsByType ?? []).map((t) => ({
    name: CHECKLIST_LABELS[t.type] ?? t.type,
    value: t.count,
    fill: CHECKLIST_COLORS[t.type] ?? '#64748b',
  }));

  const incidentUnitData = (charts.incidentsByUnit ?? []).map((u) => ({
    name: u.unit.length > 16 ? u.unit.slice(0, 16) + '…' : u.unit,
    value: u.count,
  }));

  const maxIncident = Math.max(...incidentUnitData.map((u) => u.value), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Olá, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' '}· Atualiza a cada 30s
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors">
          🔄 Atualizar
        </button>
      </div>

      {/* Alertas */}
      <div className="space-y-2">
        <AlertBanner count={summary.overdueWorkOrders} label="OS vencidas precisam de atenção" />
        <AlertBanner count={summary.criticalIncidents} label="ocorrências críticas em aberto" />
        {alerts.assetsNeedingMaintenance.filter(a => a.isOverdue).length > 0 && (
          <AlertBanner count={alerts.assetsNeedingMaintenance.filter(a => a.isOverdue).length} label="equipamentos com manutenção VENCIDA" />
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Equipamentos Ativos" value={summary.activeAssets}
          sub={`${summary.assetsInMaintenance} em manutenção`}
          icon="🏗️" accent="text-blue-700" href="/dashboard/assets" />
        <KPICard label="OS em Aberto" value={summary.openWorkOrders}
          sub={summary.overdueWorkOrders > 0 ? `⚠️ ${summary.overdueWorkOrders} vencidas` : `${summary.inProgressWorkOrders} em andamento`}
          icon="🔧" accent={summary.overdueWorkOrders > 0 ? 'text-red-700' : 'text-amber-600'}
          href="/dashboard/work-orders" />
        <KPICard label="Checklists (mês)" value={summary.checklistsThisMonth}
          sub={`${summary.checklistCompletionRate}% de conformidade`}
          icon="✅" accent="text-green-700" href="/dashboard/checklists" />
        <KPICard label="Ocorrências Abertas" value={summary.openIncidents}
          sub={summary.criticalIncidents > 0 ? `🔴 ${summary.criticalIncidents} críticas` : 'Nenhuma crítica'}
          icon="⚠️" accent={summary.criticalIncidents > 0 ? 'text-red-700' : 'text-slate-600'}
          href="/dashboard/incidents" />
      </div>

      {/* Gráficos principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Barras verticais — OS por Status */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-1">OS por Status</h2>
          <p className="text-xs text-slate-400 mb-4">Total: {summary.totalWorkOrders} ordens</p>
          {woStatusData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-3xl">🎉</p>
              <p className="text-sm text-slate-400">Nenhuma OS cadastrada</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={woStatusData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {woStatusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Rosca — Checklists por Tipo */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Checklists por Tipo</h2>
          <p className="text-xs text-slate-400 mb-2">Execuções do mês atual</p>
          {checklistTypeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <p className="text-3xl">📋</p>
              <p className="text-sm text-slate-400">Nenhuma execução este mês</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={checklistTypeData}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {checklistTypeData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
                <Legend
                  formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                  iconType="circle" iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Manutenções próximas */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">Manutenções Próximas</h2>
            {alerts.assetsNeedingMaintenance.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                {alerts.assetsNeedingMaintenance.length}
              </span>
            )}
          </div>
          {alerts.assetsNeedingMaintenance.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 gap-2">
              <p className="text-3xl">✅</p>
              <p className="text-sm text-slate-400">Tudo em dia!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.assetsNeedingMaintenance.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/dashboard/assets/${a.id}`}>
                  <div className={`flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer ${a.isOverdue ? 'bg-red-50 border border-red-100' : 'border border-slate-100'}`}>
                    <span className="text-base mt-0.5">{a.isOverdue ? '🔴' : '🟡'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-slate-400 truncate">{a.unit.name}</p>
                    </div>
                    <p className={`text-xs font-bold flex-shrink-0 ${a.isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                      {formatDate(a.nextMaintenanceAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* OS recentes — tabela */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">Atividade Recente</h2>
            <Link href="/dashboard/work-orders" className="text-xs text-blue-600 hover:underline font-semibold">Ver todas →</Link>
          </div>
          <RecentActivity
            executions={recentActivity.executions}
            completedWorkOrders={recentActivity.completedWorkOrders ?? []}
            workOrders={recentActivity.workOrders}
          />
        </div>

        {/* Coluna direita: prioridade + ocorrências por unidade */}
        <div className="space-y-6">

          {/* OS por Prioridade */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">OS por Prioridade</h2>
            {charts.woByPriority.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Nenhuma OS em aberto</p>
            ) : (
              <div className="space-y-3">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => {
                  const item = charts.woByPriority.find((x) => x.priority === p);
                  const count = item?.count ?? 0;
                  const max = Math.max(...charts.woByPriority.map((x) => x.count), 1);
                  return (
                    <div key={p} className="flex items-center gap-3">
                      <span className="text-xs font-bold w-16 text-slate-600 flex-shrink-0">{PRIORITY_LABELS[p]}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(count / max) * 100}%`, backgroundColor: PRIORITY_COLORS[p] }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 w-4 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ocorrências por Unidade */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Ocorrências por Local</h2>
            {incidentUnitData.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Nenhuma ocorrência registrada</p>
            ) : (
              <div className="space-y-3">
                {incidentUnitData.map((u, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-20 truncate flex-shrink-0">{u.name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-red-400 transition-all duration-500"
                        style={{ width: `${(u.value / maxIncident) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-4 text-right">{u.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Atividade Recente ────────────────────────────────────────────────────────

function RecentActivity({ executions, completedWorkOrders, workOrders }: {
  executions: Execution[];
  completedWorkOrders: WorkOrder[];
  workOrders: WorkOrder[];
}) {
  type Item = { kind: 'execution' | 'workorder'; date: string; data: Execution | WorkOrder };

  const items: Item[] = [
    ...executions.map((ex) => ({ kind: 'execution' as const, date: ex.completedAt ?? ex.startedAt ?? ex.createdAt, data: ex })),
    ...completedWorkOrders.map((wo) => ({ kind: 'workorder' as const, date: wo.completedAt ?? wo.updatedAt ?? wo.createdAt, data: wo })),
    ...workOrders.slice(0, 3).map((wo) => ({ kind: 'workorder' as const, date: wo.createdAt, data: wo })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Nenhuma atividade registrada</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        if (item.kind === 'execution') {
          const ex = item.data as Execution;
          return (
            <Link key={`ex-${ex.id}-${idx}`} href={`/dashboard/executions/${ex.id}`}>
              <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center text-base flex-shrink-0">📋</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{ex.checklist.name}</p>
                  <p className="text-xs text-slate-400">{ex.user.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge value={ex.status} />
                  {ex.score !== null && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${ex.score >= 80 ? 'bg-green-100 text-green-700' : ex.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{ex.score}%</span>
                  )}
                  <p className="text-xs text-slate-400">{formatDateTime(item.date)}</p>
                </div>
              </div>
            </Link>
          );
        }
        const wo = item.data as WorkOrder;
        return (
          <Link key={`wo-${wo.id}-${idx}`} href={`/dashboard/work-orders/${wo.id}`}>
            <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-base flex-shrink-0">🔧</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{wo.title}</p>
                <p className="text-xs text-slate-400">{wo.unit?.name ?? ''}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Badge value={wo.status} />
                <p className="text-xs text-slate-400">{formatDateTime(item.date)}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
