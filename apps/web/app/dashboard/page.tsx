'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { dashboardApi, DashboardKPIs, workOrdersApi, WorkOrder, Execution } from '../../lib/api';
import { formatDate, formatDateTime, isOverdue, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, getUser } from '../../lib/auth';
import { Badge } from '../../components/ui/Badge';

function KPICard({
  label, value, sub, icon, color, href,
}: {
  label: string; value: number | string; sub?: string;
  icon: string; color: string; href?: string;
}) {
  const card = (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className={`text-3xl font-extrabold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function AlertBanner({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
      <span className="text-red-500 text-xl">⚠️</span>
      <p className="text-sm font-semibold text-red-700">{count} {label}</p>
    </div>
  );
}

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
    } catch {
      // silencioso — manter dados anteriores
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // refresh a cada 30s
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            Olá, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' '}· Atualiza a cada 30s
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Alertas críticos */}
      <div className="space-y-2">
        <AlertBanner count={summary.overdueWorkOrders} label="OS vencidas precisam de atenção" />
        <AlertBanner count={summary.criticalIncidents} label="incidentes críticos em aberto" />
        {alerts.assetsNeedingMaintenance.filter(a => a.isOverdue).length > 0 && (
          <AlertBanner
            count={alerts.assetsNeedingMaintenance.filter(a => a.isOverdue).length}
            label="equipamentos com manutenção VENCIDA"
          />
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Equipamentos ativos" value={summary.activeAssets}
          sub={`${summary.assetsInMaintenance} em manutenção`}
          icon="🏗️" color="text-blue-700" href="/dashboard/assets"
        />
        <KPICard
          label="OS Abertas" value={summary.openWorkOrders}
          sub={summary.overdueWorkOrders > 0 ? `⚠️ ${summary.overdueWorkOrders} vencidas` : `${summary.inProgressWorkOrders} em andamento`}
          icon="🔧" color={summary.overdueWorkOrders > 0 ? "text-red-700" : "text-amber-700"}
          href="/dashboard/work-orders"
        />
        <KPICard
          label="Checklists (mês)" value={summary.checklistsThisMonth}
          sub={`${summary.checklistCompletionRate}% de conformidade`}
          icon="✅" color="text-green-700" href="/dashboard/checklists"
        />
        <KPICard
          label="Incidentes abertos" value={summary.openIncidents}
          sub={summary.criticalIncidents > 0 ? `🔴 ${summary.criticalIncidents} críticos` : 'Nenhum crítico'}
          icon="⚠️" color={summary.criticalIncidents > 0 ? "text-red-700" : "text-slate-700"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assets por status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">Equipamentos por Status</h2>
          <div className="space-y-3">
            {charts.assetsByStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <Badge value={s.status} />
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ width: `${summary.totalAssets > 0 ? (s.count / summary.totalAssets) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700 w-6 text-right">{s.count}</span>
              </div>
            ))}
            {charts.assetsByStatus.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">Nenhum equipamento cadastrado</p>
            )}
          </div>
        </div>

        {/* OS por prioridade */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">OS Abertas por Prioridade</h2>
          <div className="space-y-3">
            {charts.woByPriority.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-sm text-slate-400">Nenhuma OS em aberto</p>
              </div>
            ) : (
              charts.woByPriority.map((p) => (
                <div key={p.priority} className="flex items-center gap-3">
                  <Badge value={p.priority} type="priority" />
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-amber-500 rounded-full"
                      style={{ width: `${(p.count / Math.max(...charts.woByPriority.map(x => x.count))) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-6 text-right">{p.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alertas de manutenção */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Manutenções Próximas
            {alerts.assetsNeedingMaintenance.length > 0 && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {alerts.assetsNeedingMaintenance.length}
              </span>
            )}
          </h2>
          {alerts.assetsNeedingMaintenance.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm text-slate-400">Tudo em dia!</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.assetsNeedingMaintenance.slice(0, 5).map((a) => (
                <Link key={a.id} href={`/dashboard/assets/${a.id}`}>
                  <div className={`flex items-start gap-2 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer ${a.isOverdue ? 'bg-red-50' : ''}`}>
                    <span className="text-lg">{a.isOverdue ? '🔴' : '🟡'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.unit.name}</p>
                      <p className={`text-xs font-medium ${a.isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                        {a.isOverdue ? 'VENCIDA — ' : ''}
                        {formatDate(a.nextMaintenanceAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Atividade recente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OS em aberto */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">OS em Aberto</h2>
            <Link href="/dashboard/work-orders" className="text-sm text-blue-600 hover:underline font-medium">Ver todas →</Link>
          </div>
          {recentActivity.workOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Nenhuma OS aberta 🎉</div>
          ) : (
            <div className="space-y-3">
              {recentActivity.workOrders.map((wo) => (
                <Link key={wo.id} href={`/dashboard/work-orders/${wo.id}`}>
                  <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-slate-400 font-mono">{wo.code}</span>
                        <Badge value={wo.status} />
                        <Badge value={wo.priority} type="priority" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{wo.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{wo.unit.name}</p>
                    </div>
                    {wo.dueDate && (
                      <p className={`text-xs font-medium flex-shrink-0 ${isOverdue(wo.dueDate) ? 'text-red-600' : 'text-slate-400'}`}>
                        {isOverdue(wo.dueDate) ? '⚠️ ' : ''}{formatDate(wo.dueDate)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Execuções recentes + OS concluídas */}
        <RecentActivity
          executions={recentActivity.executions}
          completedWorkOrders={recentActivity.completedWorkOrders ?? []}
        />
      </div>
    </div>
  );
}

function RecentActivity({ executions, completedWorkOrders }: {
  executions: Execution[];
  completedWorkOrders: WorkOrder[];
}) {
  // Mescla checklists concluídos + OS concluídas, ordena por data mais recente
  type Item =
    | { kind: 'execution'; date: string; data: Execution }
    | { kind: 'workorder'; date: string; data: WorkOrder };

  const items: Item[] = [
    ...executions.map((ex) => ({
      kind: 'execution' as const,
      date: ex.completedAt ?? ex.startedAt ?? ex.createdAt,
      data: ex,
    })),
    ...completedWorkOrders.map((wo) => ({
      kind: 'workorder' as const,
      date: wo.completedAt ?? wo.updatedAt ?? wo.createdAt,
      data: wo,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Execuções Recentes</h2>
        <Link href="/dashboard/checklists" className="text-sm text-blue-600 hover:underline font-medium">Ver todas →</Link>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">Nenhuma atividade registrada</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => item.kind === 'execution' ? (
            <div key={`ex-${item.data.id}`} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge value={item.data.status} />
                  {item.data.score !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.data.score >= 80 ? 'bg-green-100 text-green-700' :
                      item.data.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>{item.data.score}%</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate">📋 {item.data.checklist.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.data.user.name}</p>
              </div>
              <p className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(item.date)}</p>
            </div>
          ) : (
            <Link key={`wo-${item.data.id}`} href={`/dashboard/work-orders/${item.data.id}`}>
              <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge value={item.data.status} />
                    <Badge value={item.data.priority} type="priority" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 truncate">🔧 {item.data.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.data.unit.name}</p>
                </div>
                <p className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(item.date)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
