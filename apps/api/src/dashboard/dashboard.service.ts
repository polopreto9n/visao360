import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnitsService } from '../units/units.service';
import { DashboardPeriodDto } from './dto/dashboard-period.dto';

const MAX_DASHBOARD_PERIOD_DAYS = 366;
const UNIT_RANKING_WEIGHTS = {
  conformity: 30,
  sla: 25,
  workOrderHealth: 20,
  incidents: 15,
  preventive: 10,
} as const;

const INCIDENT_SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

type DashboardPeriod = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
};

type UnitRankingMetrics = {
  id: string;
  name: string;
  code: string | null;
  activeAssets: number;
  checklistExecutions: number;
  completedChecklistExecutions: number;
  conformityScoreSum: number;
  conformityScoreCount: number;
  workOrdersCreated: number;
  openWorkOrders: number;
  overdueWorkOrders: number;
  slaWorkOrders: number;
  onTimeWorkOrders: number;
  incidents: number;
  weightedIncidents: number;
  maintenanceDue: number;
  overdueMaintenance: number;
};

function trendPct(cur: number, prev: number): number {
  if (prev === 0) return 0;
  return Math.round(((cur - prev) / prev) * 100);
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly units: UnitsService,
  ) {}

  async getKPIs(
    companyId: string,
    userId?: string,
    userRole?: string,
    periodQuery?: DashboardPeriodDto,
  ) {
    const period = this.resolvePeriod(periodQuery);
    const isScopedRole = this.isScopedDashboardRole(userRole) && !!userId;
    const unitKey = periodQuery?.unitId ?? 'all';
    const periodKey = this.periodCacheKey(periodQuery, period);
    const cacheKey = isScopedRole
      ? `dashboard:kpis:${companyId}:${userId}:${unitKey}:${periodKey}`
      : `dashboard:kpis:${companyId}:${unitKey}:${periodKey}`;

    return this.redis.getOrSet(
      cacheKey,
      () => this.computeKPIs(companyId, period, periodQuery?.unitId, userId, userRole),
      30,
    );
  }

  async getMyActions(
    userId: string,
    companyId: string,
    userRole?: string,
    periodQuery?: DashboardPeriodDto,
  ) {
    const period = this.resolvePeriod(periodQuery);
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const dueInPeriod = { gte: period.from, lte: period.to };
    const createdInPeriod = { gte: period.from, lte: period.to };

    const assignedUnitIds = await this.units.getUserUnitIds(userId);
    const scopedUnitIds = await this.resolveUnitIds(periodQuery?.unitId, userId, userRole);
    if (scopedUnitIds && scopedUnitIds.length === 0) {
      return this.emptyMyActions(period);
    }

    const scopedScheduleConditions = this.relatedUnitConditions(scopedUnitIds);
    const unassignedScheduleConditions = userRole === 'TECNICO'
      ? []
      : this.relatedUnitConditions(scopedUnitIds ?? assignedUnitIds);

    const [dueSchedules, urgentWorkOrders] = await Promise.all([
      this.prisma.checklistSchedule.findMany({
        where: {
          companyId,
          isActive: true,
          nextDueAt: dueInPeriod,
          checklist: { isActive: true },
          AND: [
            {
              OR: [
                { assigneeId: userId },
                ...(unassignedScheduleConditions.length > 0
                  ? [{
                      assigneeId: null as unknown as string,
                      OR: unassignedScheduleConditions,
                    }]
                  : []),
              ],
            },
            ...(scopedScheduleConditions.length > 0
              ? [{ OR: scopedScheduleConditions }]
              : []),
          ],
        },
        include: {
          checklist: { select: { id: true, name: true, type: true } },
          asset: { select: { id: true, name: true } },
        },
        orderBy: { nextDueAt: 'asc' },
        take: 10,
      }),
      this.prisma.workOrder.findMany({
        where: {
          companyId,
          assigneeId: userId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          AND: [
            {
              OR: [
                { dueDate: dueInPeriod },
                { dueDate: null, priority: 'CRITICAL', createdAt: createdInPeriod },
              ],
            },
            {
              OR: [
                { dueDate: { lte: in48h, not: null } },
                { priority: 'CRITICAL' },
              ],
            },
            ...(scopedUnitIds
              ? [{ unitId: { in: scopedUnitIds } }]
              : []),
          ],
        },
        include: {
          unit: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 10,
      }),
    ]);

    return {
      dueSchedules,
      urgentWorkOrders,
      total: dueSchedules.length + urgentWorkOrders.length,
      period: this.serializePeriod(period),
    };
  }

  async getUnitRanking(
    companyId: string,
    periodQuery?: DashboardPeriodDto,
    userId?: string,
    userRole?: string,
  ) {
    const period = this.resolvePeriod(periodQuery);
    const periodKey = this.periodCacheKey(periodQuery, period);
    const isScopedRole = this.isScopedDashboardRole(userRole) && !!userId;
    const cacheKey = isScopedRole
      ? `dashboard:unit-ranking:${companyId}:${userId}:${periodKey}`
      : `dashboard:unit-ranking:${companyId}:${periodKey}`;

    return this.redis.getOrSet(
      cacheKey,
      () => this.computeUnitRanking(companyId, period, userId, userRole),
      60,
    );
  }

  private async computeKPIs(
    companyId: string,
    period: DashboardPeriod,
    requestedUnitId?: string,
    userId?: string,
    userRole?: string,
  ) {
    const now = new Date();
    const inPeriod = { gte: period.from, lte: period.to };
    const inPreviousPeriod = { gte: period.previousFrom, lte: period.previousTo };

    const unitIds = await this.resolveUnitIds(requestedUnitId, userId, userRole);
    if (unitIds && unitIds.length === 0) {
      return this.emptyKPIs(period);
    }

    const unitFilter = unitIds ? { unitId: { in: unitIds } } : {};
    const relatedUnitConditions = this.relatedUnitConditions(unitIds);
    const execUnitFilter = relatedUnitConditions.length > 0
      ? { OR: relatedUnitConditions }
      : {};
    const technicianRecentExecutionFilter =
      userRole === 'TECNICO' && userId ? { userId } : {};
    const technicianRecentWorkOrderFilter =
      userRole === 'TECNICO' && userId ? { assigneeId: userId } : {};

    const [
      totalAssets, activeAssets, assetsInMaintenance,
      totalWorkOrders, openWorkOrders, inProgressWorkOrders,
      overdueWorkOrders, completedThisMonth,
      checklistsThisMonth, completedExecutions,
      openIncidents, criticalIncidents,
      assetsByStatus, woByPriority,
      recentExecutions, recentWorkOrders, completedWorkOrders,
      assetsNeedingMaintenance,
      checklistsByType,
      woByStatus,
      incidentsByUnit,
      prevChecklistsMonth, prevCompletedExecutions,
      prevCompletedThisMonth, prevNewWOs, prevNewIncidents,
      newWOsThisMonth, newIncidentsThisMonth,
      maintenanceCostAgg, prevMaintenanceCostAgg,
    ] = await Promise.all([
      this.prisma.asset.count({
        where: { companyId, createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.asset.count({
        where: { companyId, status: 'ACTIVE', createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.asset.count({
        where: { companyId, status: 'MAINTENANCE', createdAt: inPeriod, ...unitFilter },
      }),

      this.prisma.workOrder.count({
        where: { companyId, createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.workOrder.count({
        where: {
          companyId,
          status: { in: ['OPEN', 'ASSIGNED'] },
          createdAt: inPeriod,
          ...unitFilter,
        },
      }),
      this.prisma.workOrder.count({
        where: { companyId, status: 'IN_PROGRESS', createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.workOrder.count({
        where: {
          companyId,
          dueDate: { gte: period.from, lte: period.to, lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...unitFilter,
        },
      }),
      this.prisma.workOrder.count({
        where: { companyId, status: 'COMPLETED', completedAt: inPeriod, ...unitFilter },
      }),

      this.prisma.execution.count({
        where: { companyId, createdAt: inPeriod, ...execUnitFilter },
      }),
      this.prisma.execution.count({
        where: {
          companyId,
          status: 'COMPLETED',
          completedAt: inPeriod,
          ...execUnitFilter,
        },
      }),

      this.prisma.incident.count({
        where: {
          companyId,
          status: { notIn: ['RESOLVED', 'CLOSED'] },
          createdAt: inPeriod,
          ...unitFilter,
        },
      }),
      this.prisma.incident.count({
        where: {
          companyId,
          severity: 'CRITICAL',
          status: { notIn: ['RESOLVED', 'CLOSED'] },
          createdAt: inPeriod,
          ...unitFilter,
        },
      }),

      this.prisma.asset.groupBy({
        by: ['status'],
        where: { companyId, createdAt: inPeriod, ...unitFilter },
        _count: { id: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where: {
          companyId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          createdAt: inPeriod,
          ...unitFilter,
        },
        _count: { id: true },
      }),

      this.prisma.execution.findMany({
        where: {
          companyId,
          createdAt: inPeriod,
          ...execUnitFilter,
          ...technicianRecentExecutionFilter,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          checklist: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          companyId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          createdAt: inPeriod,
          ...unitFilter,
          ...technicianRecentWorkOrderFilter,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        include: {
          unit: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          companyId,
          OR: [
            { status: 'COMPLETED', completedAt: inPeriod },
            { status: 'CANCELLED', updatedAt: inPeriod },
          ],
          ...unitFilter,
          ...technicianRecentWorkOrderFilter,
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 5,
        include: {
          unit: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),

      this.prisma.asset.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          nextMaintenanceAt: inPeriod,
          ...unitFilter,
        },
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          nextMaintenanceAt: true,
          unit: { select: { name: true } },
        },
        orderBy: { nextMaintenanceAt: 'asc' },
        take: 10,
      }),

      this.prisma.execution.findMany({
        where: { companyId, createdAt: inPeriod, ...execUnitFilter },
        include: { checklist: { select: { type: true } } },
        take: 500,
      }),

      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { companyId, createdAt: inPeriod, ...unitFilter },
        _count: { id: true },
      }),

      this.prisma.incident.groupBy({
        by: ['unitId'],
        where: { companyId, createdAt: inPeriod, ...unitFilter },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),

      this.prisma.execution.count({
        where: { companyId, createdAt: inPreviousPeriod, ...execUnitFilter },
      }),
      this.prisma.execution.count({
        where: {
          companyId,
          status: 'COMPLETED',
          completedAt: inPreviousPeriod,
          ...execUnitFilter,
        },
      }),
      this.prisma.workOrder.count({
        where: {
          companyId,
          status: 'COMPLETED',
          completedAt: inPreviousPeriod,
          ...unitFilter,
        },
      }),
      this.prisma.workOrder.count({
        where: { companyId, createdAt: inPreviousPeriod, ...unitFilter },
      }),
      this.prisma.incident.count({
        where: { companyId, createdAt: inPreviousPeriod, ...unitFilter },
      }),
      this.prisma.workOrder.count({
        where: { companyId, createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.incident.count({
        where: { companyId, createdAt: inPeriod, ...unitFilter },
      }),
      this.prisma.workOrder.aggregate({
        where: { companyId, status: 'COMPLETED', completedAt: inPeriod, ...unitFilter },
        _sum: { cost: true },
      }),
      this.prisma.workOrder.aggregate({
        where: { companyId, status: 'COMPLETED', completedAt: inPreviousPeriod, ...unitFilter },
        _sum: { cost: true },
      }),
    ]);

    const maintenanceCostThisMonth = maintenanceCostAgg._sum.cost ?? 0;
    const prevMaintenanceCost = prevMaintenanceCostAgg._sum.cost ?? 0;

    const checklistCompletionRate =
      checklistsThisMonth > 0
        ? Math.round((completedExecutions / checklistsThisMonth) * 100)
        : 0;

    const prevChecklistCompletionRate =
      prevChecklistsMonth > 0
        ? Math.round((prevCompletedExecutions / prevChecklistsMonth) * 100)
        : 0;

    return {
      period: this.serializePeriod(period),
      summary: {
        totalAssets,
        activeAssets,
        assetsInMaintenance,
        totalWorkOrders,
        openWorkOrders,
        inProgressWorkOrders,
        overdueWorkOrders,
        completedThisMonth,
        checklistsThisMonth,
        checklistCompletionRate,
        openIncidents,
        criticalIncidents,
        maintenanceCostThisMonth,
        trends: {
          newWorkOrders: { pct: trendPct(newWOsThisMonth, prevNewWOs), prev: prevNewWOs },
          maintenanceCost: {
            pct: trendPct(maintenanceCostThisMonth, prevMaintenanceCost),
            prev: prevMaintenanceCost,
          },
          completedThisMonth: {
            pct: trendPct(completedThisMonth, prevCompletedThisMonth),
            prev: prevCompletedThisMonth,
          },
          checklistsThisMonth: {
            pct: trendPct(checklistsThisMonth, prevChecklistsMonth),
            prev: prevChecklistsMonth,
          },
          checklistCompletionRate: {
            pct: trendPct(checklistCompletionRate, prevChecklistCompletionRate),
            prev: prevChecklistCompletionRate,
          },
          newIncidents: {
            pct: trendPct(newIncidentsThisMonth, prevNewIncidents),
            prev: prevNewIncidents,
          },
        },
      },
      charts: {
        assetsByStatus: assetsByStatus.map((s) => ({ status: s.status, count: s._count.id })),
        woByPriority: woByPriority.map((p) => ({ priority: p.priority, count: p._count.id })),
        woByStatus: woByStatus.map((s) => ({ status: s.status, count: s._count.id })),
        checklistsByType: (() => {
          const counts: Record<string, number> = {};
          for (const ex of checklistsByType) {
            const type = (ex.checklist as { type: string }).type;
            counts[type] = (counts[type] ?? 0) + 1;
          }
          return Object.entries(counts).map(([type, count]) => ({ type, count }));
        })(),
        incidentsByUnit: await Promise.all(
          incidentsByUnit.map(async (incident) => {
            const unit = await this.prisma.unit.findFirst({
              where: { id: incident.unitId, companyId },
              select: { name: true },
            });
            return { unit: unit?.name ?? incident.unitId, count: incident._count.id };
          }),
        ),
      },
      recentActivity: {
        executions: recentExecutions,
        workOrders: recentWorkOrders,
        completedWorkOrders,
      },
      alerts: {
        assetsNeedingMaintenance: assetsNeedingMaintenance.map((asset) => ({
          ...asset,
          isOverdue: asset.nextMaintenanceAt ? asset.nextMaintenanceAt < now : false,
        })),
      },
    };
  }

  private async computeUnitRanking(
    companyId: string,
    period: DashboardPeriod,
    userId?: string,
    userRole?: string,
  ) {
    const now = new Date();
    const inPeriod = { gte: period.from, lte: period.to };
    const scopedUnitIds = await this.resolveUnitIds(undefined, userId, userRole);
    if (scopedUnitIds && scopedUnitIds.length === 0) {
      return this.emptyUnitRanking(period);
    }
    const units = await this.prisma.unit.findMany({
      where: {
        companyId,
        isActive: true,
        ...(scopedUnitIds ? { id: { in: scopedUnitIds } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    const unitIds = units.map((unit) => unit.id);

    if (unitIds.length === 0) {
      return this.emptyUnitRanking(period);
    }

    const metrics = new Map<string, UnitRankingMetrics>(
      units.map((unit) => [
        unit.id,
        {
          ...unit,
          activeAssets: 0,
          checklistExecutions: 0,
          completedChecklistExecutions: 0,
          conformityScoreSum: 0,
          conformityScoreCount: 0,
          workOrdersCreated: 0,
          openWorkOrders: 0,
          overdueWorkOrders: 0,
          slaWorkOrders: 0,
          onTimeWorkOrders: 0,
          incidents: 0,
          weightedIncidents: 0,
          maintenanceDue: 0,
          overdueMaintenance: 0,
        },
      ]),
    );

    const [
      activeAssets,
      maintenanceAssets,
      checklistExecutions,
      createdWorkOrders,
      completedWorkOrders,
      incidents,
    ] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['unitId'],
        where: {
          companyId,
          unitId: { in: unitIds },
          status: 'ACTIVE',
        },
        _count: { id: true },
      }),
      this.prisma.asset.findMany({
        where: {
          companyId,
          unitId: { in: unitIds },
          status: 'ACTIVE',
          nextMaintenanceAt: inPeriod,
        },
        select: { unitId: true, nextMaintenanceAt: true },
      }),
      this.prisma.execution.findMany({
        where: {
          companyId,
          createdAt: inPeriod,
          OR: this.relatedUnitConditions(unitIds),
        },
        select: {
          status: true,
          completedAt: true,
          score: true,
          checklist: { select: { unitId: true } },
          asset: { select: { unitId: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { companyId, unitId: { in: unitIds }, createdAt: inPeriod },
        select: { unitId: true, status: true, dueDate: true },
      }),
      this.prisma.workOrder.findMany({
        where: {
          companyId,
          unitId: { in: unitIds },
          status: 'COMPLETED',
          completedAt: inPeriod,
          dueDate: { not: null },
        },
        select: { unitId: true, completedAt: true, dueDate: true },
      }),
      this.prisma.incident.findMany({
        where: { companyId, unitId: { in: unitIds }, createdAt: inPeriod },
        select: { unitId: true, severity: true },
      }),
    ]);

    for (const assetGroup of activeAssets) {
      const unit = metrics.get(assetGroup.unitId);
      if (unit) unit.activeAssets = assetGroup._count.id;
    }

    for (const asset of maintenanceAssets) {
      const unit = metrics.get(asset.unitId);
      if (!unit) continue;

      unit.maintenanceDue += 1;
      if (asset.nextMaintenanceAt && asset.nextMaintenanceAt < now) {
        unit.overdueMaintenance += 1;
      }
    }

    for (const execution of checklistExecutions) {
      const unitId = execution.asset?.unitId ?? execution.checklist.unitId;
      const unit = unitId ? metrics.get(unitId) : undefined;
      if (!unit) continue;

      unit.checklistExecutions += 1;
      if (
        execution.status === 'COMPLETED' &&
        execution.completedAt &&
        execution.completedAt >= period.from &&
        execution.completedAt <= period.to
      ) {
        unit.completedChecklistExecutions += 1;
        if (execution.score !== null) {
          unit.conformityScoreSum += execution.score;
          unit.conformityScoreCount += 1;
        }
      }
    }

    for (const order of createdWorkOrders) {
      const unit = metrics.get(order.unitId);
      if (!unit) continue;

      unit.workOrdersCreated += 1;
      if (order.status === 'COMPLETED' || order.status === 'CANCELLED') continue;

      unit.openWorkOrders += 1;
      if (
        order.dueDate &&
        order.dueDate < now &&
        order.dueDate >= period.from &&
        order.dueDate <= period.to
      ) {
        unit.overdueWorkOrders += 1;
      }
    }

    for (const order of completedWorkOrders) {
      const unit = metrics.get(order.unitId);
      if (!unit || !order.completedAt || !order.dueDate) continue;

      unit.slaWorkOrders += 1;
      if (order.completedAt <= order.dueDate) {
        unit.onTimeWorkOrders += 1;
      }
    }

    for (const incident of incidents) {
      const unit = metrics.get(incident.unitId);
      if (!unit) continue;

      unit.incidents += 1;
      unit.weightedIncidents += INCIDENT_SEVERITY_WEIGHTS[incident.severity] ?? 1;
    }

    const scored = [...metrics.values()].map((metric) => ({
      metric,
      incidentRate: metric.activeAssets > 0
        ? metric.weightedIncidents / metric.activeAssets
        : 0,
    }));
    const observedMaxIncidentRate = Math.max(
      ...scored
        .filter((unit) => unit.metric.activeAssets > 0)
        .map((unit) => unit.incidentRate),
      0,
    );
    const maxIncidentRate = observedMaxIncidentRate > 0 ? observedMaxIncidentRate : 1;
    const ranked = scored.map(({ metric, incidentRate }) =>
      this.scoreUnitRanking(metric, incidentRate, maxIncidentRate),
    );
    const eligible = ranked.filter((unit) => unit.eligible);

    return {
      period: this.serializePeriod(period),
      formula: {
        weights: UNIT_RANKING_WEIGHTS,
        incidentNormalization: 'Ocorrências ponderadas por severidade e equipamentos ativos.',
        eligibility: 'Mínimo de volume e dois componentes mensuráveis no período.',
      },
      totals: {
        comparedUnits: ranked.length,
        eligibleUnits: eligible.length,
        insufficientDataUnits: ranked.length - eligible.length,
      },
      best: [...eligible]
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
        .slice(0, 5),
      worst: [...eligible]
        .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))
        .slice(0, 5),
    };
  }

  private scoreUnitRanking(
    metric: UnitRankingMetrics,
    incidentRate: number,
    maxIncidentRate: number,
  ) {
    const components: Array<{ weight: number; score: number }> = [];
    const conformityRate = metric.conformityScoreCount > 0
      ? (metric.conformityScoreSum / metric.conformityScoreCount) / 100
      : null;
    const slaRate = metric.slaWorkOrders > 0
      ? metric.onTimeWorkOrders / metric.slaWorkOrders
      : null;
    const workOrderHealth = metric.openWorkOrders > 0
      ? 1 - metric.overdueWorkOrders / metric.openWorkOrders
      : null;
    const incidentHealth = metric.activeAssets > 0
      ? 1 - incidentRate / maxIncidentRate
      : null;
    const preventiveHealth = metric.maintenanceDue > 0
      ? 1 - metric.overdueMaintenance / metric.maintenanceDue
      : null;

    if (conformityRate !== null) {
      components.push({ weight: UNIT_RANKING_WEIGHTS.conformity, score: conformityRate });
    }
    if (slaRate !== null) {
      components.push({ weight: UNIT_RANKING_WEIGHTS.sla, score: slaRate });
    }
    if (workOrderHealth !== null) {
      components.push({ weight: UNIT_RANKING_WEIGHTS.workOrderHealth, score: workOrderHealth });
    }
    if (incidentHealth !== null) {
      components.push({ weight: UNIT_RANKING_WEIGHTS.incidents, score: incidentHealth });
    }
    if (preventiveHealth !== null) {
      components.push({ weight: UNIT_RANKING_WEIGHTS.preventive, score: preventiveHealth });
    }

    const availableWeight = components.reduce((total, component) => total + component.weight, 0);
    const score = availableWeight > 0
      ? Math.round(
          (components.reduce(
            (total, component) => total + this.clampRatio(component.score) * component.weight,
            0,
          ) / availableWeight) * 100,
        )
      : 0;
    const volumeSignals = [
      metric.checklistExecutions >= 5,
      metric.workOrdersCreated >= 3,
      metric.activeAssets >= 10,
    ].filter(Boolean).length;
    const eligible = volumeSignals > 0 && components.length >= 2;
    const confidence = !eligible
      ? 'BAIXA'
      : volumeSignals >= 2 && components.length >= 3
        ? 'ALTA'
        : 'MEDIA';

    return {
      id: metric.id,
      name: metric.name,
      code: metric.code,
      score,
      eligible,
      confidence,
      indicators: {
        activeAssets: metric.activeAssets,
        checklistExecutions: metric.checklistExecutions,
        conformityRate: this.toPercent(conformityRate),
        workOrdersCreated: metric.workOrdersCreated,
        openWorkOrders: metric.openWorkOrders,
        overdueWorkOrders: metric.overdueWorkOrders,
        slaOrders: metric.slaWorkOrders,
        slaRate: this.toPercent(slaRate),
        incidents: metric.incidents,
        weightedIncidents: metric.weightedIncidents,
        maintenanceDue: metric.maintenanceDue,
        overdueMaintenance: metric.overdueMaintenance,
      },
    };
  }

  private emptyUnitRanking(period: DashboardPeriod) {
    return {
      period: this.serializePeriod(period),
      formula: {
        weights: UNIT_RANKING_WEIGHTS,
        incidentNormalization: 'Ocorrências ponderadas por severidade e equipamentos ativos.',
        eligibility: 'Mínimo de volume e dois componentes mensuráveis no período.',
      },
      totals: {
        comparedUnits: 0,
        eligibleUnits: 0,
        insufficientDataUnits: 0,
      },
      best: [],
      worst: [],
    };
  }

  private emptyKPIs(period: DashboardPeriod) {
    return {
      period: this.serializePeriod(period),
      summary: {
        totalAssets: 0,
        activeAssets: 0,
        assetsInMaintenance: 0,
        totalWorkOrders: 0,
        openWorkOrders: 0,
        inProgressWorkOrders: 0,
        overdueWorkOrders: 0,
        completedThisMonth: 0,
        checklistsThisMonth: 0,
        checklistCompletionRate: 0,
        openIncidents: 0,
        criticalIncidents: 0,
        maintenanceCostThisMonth: 0,
        trends: {
          newWorkOrders: { pct: 0, prev: 0 },
          maintenanceCost: { pct: 0, prev: 0 },
          completedThisMonth: { pct: 0, prev: 0 },
          checklistsThisMonth: { pct: 0, prev: 0 },
          checklistCompletionRate: { pct: 0, prev: 0 },
          newIncidents: { pct: 0, prev: 0 },
        },
      },
      charts: {
        assetsByStatus: [],
        woByPriority: [],
        woByStatus: [],
        checklistsByType: [],
        incidentsByUnit: [],
      },
      recentActivity: { executions: [], workOrders: [], completedWorkOrders: [] },
      alerts: { assetsNeedingMaintenance: [] },
    };
  }

  private emptyMyActions(period: DashboardPeriod) {
    return {
      dueSchedules: [],
      urgentWorkOrders: [],
      total: 0,
      period: this.serializePeriod(period),
    };
  }

  private async resolveUnitIds(
    requestedUnitId?: string,
    userId?: string,
    userRole?: string,
  ): Promise<string[] | undefined> {
    if (!this.isScopedDashboardRole(userRole) || !userId) {
      return requestedUnitId ? [requestedUnitId] : undefined;
    }

    const assignedUnitIds = await this.units.getUserUnitIds(userId);
    if (assignedUnitIds.length === 0) return [];
    if (!requestedUnitId) return assignedUnitIds;
    return assignedUnitIds.includes(requestedUnitId) ? [requestedUnitId] : [];
  }

  private isScopedDashboardRole(userRole?: string) {
    return userRole === 'GESTOR' || userRole === 'TECNICO' || userRole === 'CLIENTE';
  }

  private relatedUnitConditions(unitIds?: string[]) {
    if (!unitIds?.length) return [];

    return [
      { checklist: { unitId: { in: unitIds } } },
      { asset: { unitId: { in: unitIds } } },
    ];
  }

  private clampRatio(value: number) {
    return Math.min(1, Math.max(0, value));
  }

  private toPercent(value: number | null) {
    return value === null ? null : Math.round(this.clampRatio(value) * 100);
  }

  private resolvePeriod(query?: DashboardPeriodDto): DashboardPeriod {
    const now = new Date();
    const filter = query?.period ?? 'month';
    let from: Date;
    let to: Date;

    switch (filter) {
      case 'today':
        from = this.startOfDay(now);
        to = this.endOfDay(now);
        break;
      case '7d':
        from = this.startOfDay(
          new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
        );
        to = this.endOfDay(now);
        break;
      case '30d':
        from = this.startOfDay(
          new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29),
        );
        to = this.endOfDay(now);
        break;
      case 'custom':
        if (!query?.startDate || !query?.endDate) {
          throw new BadRequestException(
            'Informe a data inicial e a data final do periodo personalizado.',
          );
        }
        from = this.parseDateBoundary(query.startDate, false);
        to = this.parseDateBoundary(query.endDate, true);
        break;
      case 'month':
      default:
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('A data inicial deve ser anterior à data final.');
    }

    const duration = to.getTime() - from.getTime() + 1;
    const maxDuration = MAX_DASHBOARD_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    if (duration > maxDuration) {
      throw new BadRequestException(
        `O período máximo do dashboard é de ${MAX_DASHBOARD_PERIOD_DAYS} dias.`,
      );
    }

    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - duration + 1);

    return { from, to, previousFrom, previousTo };
  }

  private parseDateBoundary(value: string, endOfDay: boolean) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Período inválido para o dashboard.');
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      parsed.setHours(
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      );
    }

    return parsed;
  }

  private startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
  }

  private periodCacheKey(query: DashboardPeriodDto | undefined, period: DashboardPeriod) {
    const filter = query?.period ?? 'month';
    const startDate = query?.startDate ?? 'auto';
    const endDate = query?.endDate ?? 'auto';
    return `${filter}:${startDate}:${endDate}:${period.from.getTime()}:${period.to.getTime()}`;
  }

  private serializePeriod(period: DashboardPeriod) {
    return {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      previousFrom: period.previousFrom.toISOString(),
      previousTo: period.previousTo.toISOString(),
    };
  }
}
