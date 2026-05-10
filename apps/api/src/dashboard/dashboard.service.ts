import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getKPIs(companyId: string) {
    const cacheKey = `dashboard:kpis:${companyId}`;
    return this.redis.getOrSet(cacheKey, () => this.computeKPIs(companyId), 30);
  }

  private async computeKPIs(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalAssets, activeAssets, assetsInMaintenance,
      totalWorkOrders, openWorkOrders, inProgressWorkOrders,
      overdueWorkOrders, completedThisMonth,
      checklistsThisMonth, completedExecutions,
      openIncidents, criticalIncidents,
      assetsByStatus, woByPriority,
      recentExecutions, recentWorkOrders,
      assetsNeedingMaintenance,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { companyId } }),
      this.prisma.asset.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.asset.count({ where: { companyId, status: 'MAINTENANCE' } }),

      this.prisma.workOrder.count({ where: { companyId } }),
      this.prisma.workOrder.count({
        where: { companyId, status: { in: ['OPEN', 'ASSIGNED'] } },
      }),
      this.prisma.workOrder.count({ where: { companyId, status: 'IN_PROGRESS' } }),
      this.prisma.workOrder.count({
        where: {
          companyId,
          dueDate: { lt: now },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      this.prisma.workOrder.count({
        where: { companyId, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
      }),

      this.prisma.execution.count({
        where: { companyId, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.execution.count({
        where: { companyId, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
      }),

      this.prisma.incident.count({
        where: { companyId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      this.prisma.incident.count({
        where: { companyId, severity: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),

      this.prisma.asset.groupBy({
        by: ['status'], where: { companyId }, _count: { id: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['priority'],
        where: { companyId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        _count: { id: true },
      }),

      this.prisma.execution.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' }, take: 5,
        include: {
          checklist: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { companyId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 5,
        include: {
          unit: { select: { name: true } },
          assignee: { select: { name: true } },
        },
      }),

      // Assets com manutenção vencida ou próxima (7 dias)
      this.prisma.asset.findMany({
        where: {
          companyId, status: 'ACTIVE',
          nextMaintenanceAt: { lte: nextWeek },
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
