import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UnitsService } from '../units/units.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly units: UnitsService,
  ) {}

  async getKPIs(companyId: string, userId?: string, userRole?: string) {
    const isScopedRole = (userRole === 'TECNICO' || userRole === 'CLIENTE') && !!userId;
    const cacheKey = isScopedRole
      ? `dashboard:kpis:${companyId}:${userId}`
      : `dashboard:kpis:${companyId}`;
    return this.redis.getOrSet(cacheKey, () => this.computeKPIs(companyId, userId, userRole), 30);
  }

  private async computeKPIs(companyId: string, userId?: string, userRole?: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let unitIds: string[] | undefined;
    if ((userRole === 'TECNICO' || userRole === 'CLIENTE') && userId) {
      const ids = await this.units.getUserUnitIds(userId);
      if (ids.length > 0) unitIds = ids;
    }

    const unitFilter = unitIds ? { unitId: { in: unitIds } } : {};
    const execUnitFilter = unitIds ? { checklist: { unitId: { in: unitIds } } } : {};

    const [
      totalAssets, activeAssets, assetsInMaintenance,
      totalWorkOrders, openWorkOrders, inProgressWorkOrders,
      overdueWorkOrders, completedThisMonth,
      checklistsThisMonth, completedExecutions,
      openIncidents, criticalIncidents,
      assetsByStatus, woByPriority,
      recentExecutions, recentWorkOrders, completedWorkOrders,
      assetsNeedingMaintenance,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { companyId, ...unitFilter } }),
      this.prisma.asset.count({ where: { companyId, status: 'ACTIVE', ...unitFilter } }),
      this.prisma.asset.count({ where: { companyId, status: 'MAINTENANCE', ...unitFilter } }),

      this.prisma.workOrder.count({ where: { companyId, ...unitFilter } }),
      this.prisma.workOrder.count({
        where: { companyId, status: { in: ['OPEN', 'ASSIGNED'] }, ...unitFilter },
      }),
      this.prisma.workOrder.count({ where: { companyId, status: 'IN_PROGRESS', ...unitFilter } }),
      this.prisma.workOrder.count({
        where: {
          companyId,
          dueDate: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...unitFilter,
        },
      }),
      this.prisma.workOrder.count({
        where: { companyId, status: 'COMPLETED', completedAt: { gte: startOfMonth }, ...unitFilter },
      }),

      this.prisma.execution.count({
        where: { companyId, createdAt: { gte: startOfMonth }, ...execUnitFilter },
      }),
      this.prisma.execution.count({
        where: { companyId, status: 'COMPLETED', completedAt: { gte: startOfMonth }, ...execUnitFilter },
      }),

      this.prisma.incident.count({
        where: { companyId, status: { notIn: ['RESOLVED', 'CLOSED'] }, ...unitFilter },
      }),
      this.prisma.incident.count({
        where: { companyId, severity: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] }, ...unitFilter },
      }),

      this.prisma.asset.groupBy({
        by: ['status'], where: { companyId, ...unitFilter }, _count: { id: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where: { companyId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...unitFilter },
        _count: { id: true },
      }),

      this.prisma.execution.findMany({
        where: { companyId, ...execUnitFilter },
        orderBy: { createdAt: 'desc' }, take: 5,
        include: {
          checklist: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { companyId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...unitFilter },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 5,
        include: {
          unit: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { companyId, status: { in: ['COMPLETED', 'CANCELLED'] }, ...unitFilter },
        orderBy: [{ updatedAt: 'desc' }], take: 5,
        include: {
          unit: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),

      this.prisma.asset.findMany({
        where: {
          companyId, status: 'ACTIVE',
          nextMaintenanceAt: { lte: nextWeek },
          ...unitFilter,
        },
        select: { id: true, name: true, code: true, category: true, nextMaintenanceAt: true,
          unit: { select: { name: true } } },
        orderBy: { nextMaintenanceAt: 'asc' }, take: 10,
      }),
    ]);

    const checklistCompletionRate =
      checklistsThisMonth > 0
        ? Math.round((completedExecutions / checklistsThisMonth) * 100)
        : 0;

    return {
      summary: {
        totalAssets, activeAssets, assetsInMaintenance,
        totalWorkOrders, openWorkOrders, inProgressWorkOrders,
        overdueWorkOrders, completedThisMonth,
        checklistsThisMonth, checklistCompletionRate,
        openIncidents, criticalIncidents,
      },
      charts: {
        assetsByStatus: assetsByStatus.map((s) => ({
          status: s.status, count: s._count.id,
        })),
        woByPriority: woByPriority.map((p) => ({
          priority: p.priority, count: p._count.id,
        })),
      },
      recentActivity: {
        executions: recentExecutions,
        workOrders: recentWorkOrders,
        completedWorkOrders,
      },
      alerts: {
        assetsNeedingMaintenance: assetsNeedingMaintenance.map((a) => ({
          ...a,
          isOverdue: a.nextMaintenanceAt ? a.nextMaintenanceAt < now : false,
        })),
      },
    };
  }
}
