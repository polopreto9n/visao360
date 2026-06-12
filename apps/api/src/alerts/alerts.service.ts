import { BadRequestException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { paginated } from '../common/dto/pagination.dto';
import { AlertSeverity, ListAlertsDto } from './dto/list-alerts.dto';

const ALERT_QUERY_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICO: 4,
  ALTO: 3,
  MEDIO: 2,
  INFORMATIVO: 1,
};

type AlertSource =
  | 'WORK_ORDER_OVERDUE'
  | 'MAINTENANCE_OVERDUE'
  | 'CHECKLIST_OVERDUE'
  | 'ASSET_WITHOUT_INSPECTION'
  | 'INCIDENT_OPEN';

type AlertUnit = { id: string; name: string };

type AlertCandidate = {
  fingerprint: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  body: string;
  href: string;
  unit: AlertUnit | null;
  occurredAt: Date;
};

type AlertItem = Omit<AlertCandidate, 'occurredAt'> & {
  occurredAt: string;
  isRead: boolean;
  readAt: string | null;
};

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  async findAll(
    companyId: string,
    userId: string,
    userRole: string,
    dto: ListAlertsDto,
  ) {
    const unitIds = await this.getScopedUnitIds(userId, userRole);
    if (unitIds && unitIds.length === 0) return this.emptyFeed(dto);

    const candidates = await this.buildCandidates(companyId, unitIds);
    const reads = await this.prisma.alertRead.findMany({
      where: {
        companyId,
        userId,
        fingerprint: { in: candidates.map((alert) => alert.fingerprint) },
      },
      select: { fingerprint: true, readAt: true },
    });
    const readMap = new Map(reads.map((read) => [read.fingerprint, read.readAt]));
    const alerts = candidates.map((alert) => this.withReadState(alert, readMap));
    const filtered = this.filterAlerts(alerts, dto);
    const pageData = filtered.slice(dto.skip, dto.skip + dto.limit);

    return {
      ...paginated(pageData, filtered.length, dto),
      summary: this.summary(alerts),
    };
  }

  async markAsRead(fingerprint: string, userId: string, companyId: string) {
    if (!fingerprint || fingerprint.length > 240 || fingerprint.includes('/')) {
      throw new BadRequestException('Alerta inválido.');
    }

    const read = await this.prisma.alertRead.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      update: { companyId, readAt: new Date() },
      create: { companyId, userId, fingerprint },
      select: { fingerprint: true, readAt: true },
    });

    return { fingerprint: read.fingerprint, readAt: read.readAt, isRead: true };
  }

  private async buildCandidates(companyId: string, unitIds?: string[]) {
    const now = new Date();
    const unitFilter = unitIds ? { unitId: { in: unitIds } } : {};
    const scheduleScope = unitIds ? { OR: this.relatedUnitConditions(unitIds) } : {};

    const [workOrders, maintenanceAssets, overdueSchedules, assetsWithoutInspection, incidents] =
      await Promise.all([
        this.prisma.workOrder.findMany({
          where: {
            companyId,
            dueDate: { lt: now },
            status: { notIn: ['COMPLETED', 'CANCELLED'] },
            ...unitFilter,
          },
          select: {
            id: true,
            code: true,
            title: true,
            priority: true,
            dueDate: true,
            unit: { select: { id: true, name: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: ALERT_QUERY_LIMIT,
        }),
        this.prisma.asset.findMany({
          where: {
            companyId,
            status: 'ACTIVE',
            nextMaintenanceAt: { lt: now },
            ...unitFilter,
          },
          select: {
            id: true,
            name: true,
            category: true,
            nextMaintenanceAt: true,
            unit: { select: { id: true, name: true } },
          },
          orderBy: { nextMaintenanceAt: 'asc' },
          take: ALERT_QUERY_LIMIT,
        }),
        this.prisma.checklistSchedule.findMany({
          where: {
            companyId,
            isActive: true,
            nextDueAt: { lt: now },
            checklist: { isActive: true },
            ...scheduleScope,
          },
          select: {
            id: true,
            nextDueAt: true,
            checklist: {
              select: {
                id: true,
                name: true,
                unit: { select: { id: true, name: true } },
              },
            },
            asset: {
              select: {
                id: true,
                name: true,
                unit: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { nextDueAt: 'asc' },
          take: ALERT_QUERY_LIMIT,
        }),
        this.prisma.asset.findMany({
          where: {
            companyId,
            status: 'ACTIVE',
            executions: {
              none: {
                status: 'COMPLETED',
                checklist: { type: 'INSPECTION' },
              },
            },
            ...unitFilter,
          },
          select: {
            id: true,
            name: true,
            category: true,
            createdAt: true,
            unit: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: ALERT_QUERY_LIMIT,
        }),
        this.prisma.incident.findMany({
          where: {
            companyId,
            status: { notIn: ['RESOLVED', 'CLOSED'] },
            ...unitFilter,
          },
          select: {
            id: true,
            title: true,
            severity: true,
            createdAt: true,
            unit: { select: { id: true, name: true } },
          },
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
          take: ALERT_QUERY_LIMIT,
        }),
      ]);

    const workOrderAlerts = workOrders.map((order) => {
      const dueDate = order.dueDate ?? now;
      const lateDays = this.lateDays(dueDate, now);
      const severity = order.priority === 'CRITICAL' || lateDays >= 3 ? 'CRITICO' : 'ALTO';
      return this.alert({
        fingerprint: `work-order-overdue:${order.id}:${dueDate.toISOString()}`,
        source: 'WORK_ORDER_OVERDUE',
        severity,
        title: `OS vencida: ${order.code}`,
        body: `"${order.title}" está atrasada há ${lateDays} dia(s).`,
        href: `/dashboard/work-orders/${order.id}`,
        unit: order.unit,
        occurredAt: dueDate,
      });
    });

    const maintenanceAlerts = maintenanceAssets.map((asset) => {
      const dueDate = asset.nextMaintenanceAt ?? now;
      const lateDays = this.lateDays(dueDate, now);
      return this.alert({
        fingerprint: `maintenance-overdue:${asset.id}:${dueDate.toISOString()}`,
        source: 'MAINTENANCE_OVERDUE',
        severity: lateDays >= 7 ? 'CRITICO' : 'ALTO',
        title: `Manutenção vencida: ${asset.name}`,
        body: `${asset.category} com manutenção atrasada há ${lateDays} dia(s).`,
        href: `/dashboard/assets/${asset.id}`,
        unit: asset.unit,
        occurredAt: dueDate,
      });
    });

    const checklistAlerts = overdueSchedules.map((schedule) => {
      const lateDays = this.lateDays(schedule.nextDueAt, now);
      const unit = schedule.asset?.unit ?? schedule.checklist.unit ?? null;
      const assetLabel = schedule.asset ? ` para ${schedule.asset.name}` : '';
      return this.alert({
        fingerprint: `checklist-overdue:${schedule.id}:${schedule.nextDueAt.toISOString()}`,
        source: 'CHECKLIST_OVERDUE',
        severity: lateDays >= 3 ? 'ALTO' : 'MEDIO',
        title: `Checklist atrasado: ${schedule.checklist.name}`,
        body: `Execução prevista${assetLabel} há ${lateDays} dia(s).`,
        href: '/dashboard/checklists',
        unit,
        occurredAt: schedule.nextDueAt,
      });
    });

    const inspectionAlerts = assetsWithoutInspection.map((asset) => this.alert({
      fingerprint: `asset-without-inspection:${asset.id}`,
      source: 'ASSET_WITHOUT_INSPECTION',
      severity: 'INFORMATIVO',
      title: `Equipamento sem inspeção: ${asset.name}`,
      body: `${asset.category} ainda não possui inspeção concluída registrada.`,
      href: `/dashboard/assets/${asset.id}`,
      unit: asset.unit,
      occurredAt: asset.createdAt,
    }));

    const incidentAlerts = incidents.map((incident) => this.alert({
      fingerprint: `incident-open:${incident.id}`,
      source: 'INCIDENT_OPEN',
      severity: this.incidentSeverity(incident.severity),
      title: `Ocorrência aberta: ${incident.title}`,
      body: 'A ocorrência continua aguardando acompanhamento.',
      href: '/dashboard/incidents',
      unit: incident.unit,
      occurredAt: incident.createdAt,
    }));

    return [
      ...workOrderAlerts,
      ...maintenanceAlerts,
      ...checklistAlerts,
      ...incidentAlerts,
      ...inspectionAlerts,
    ].sort((left, right) => {
      const severityDelta = SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity];
      if (severityDelta !== 0) return severityDelta;
      return right.occurredAt.getTime() - left.occurredAt.getTime();
    });
  }

  private relatedUnitConditions(unitIds: string[]) {
    return [
      { checklist: { unitId: { in: unitIds } } },
      { asset: { unitId: { in: unitIds } } },
    ];
  }

  private async getScopedUnitIds(userId: string, userRole: string) {
    if (userRole !== Role.GESTOR && userRole !== Role.TECNICO && userRole !== Role.CLIENTE) {
      return undefined;
    }
    return this.units.getUserUnitIds(userId);
  }

  private alert(candidate: AlertCandidate) {
    return candidate;
  }

  private withReadState(
    alert: AlertCandidate,
    readMap: Map<string, Date>,
  ): AlertItem {
    const readAt = readMap.get(alert.fingerprint);
    return {
      ...alert,
      occurredAt: alert.occurredAt.toISOString(),
      isRead: !!readAt,
      readAt: readAt?.toISOString() ?? null,
    };
  }

  private filterAlerts(alerts: AlertItem[], dto: ListAlertsDto) {
    const search = dto.search?.trim().toLocaleLowerCase('pt-BR');

    return alerts.filter((alert) => {
      if (dto.severity && alert.severity !== dto.severity) return false;
      if (dto.unreadOnly && alert.isRead) return false;
      if (!search) return true;

      return [
        alert.title,
        alert.body,
        alert.unit?.name ?? '',
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(search));
    });
  }

  private summary(alerts: AlertItem[]) {
    return alerts.reduce(
      (summary, alert) => {
        summary.total += 1;
        if (!alert.isRead) summary.unread += 1;
        summary.bySeverity[alert.severity] += 1;
        return summary;
      },
      {
        total: 0,
        unread: 0,
        bySeverity: {
          CRITICO: 0,
          ALTO: 0,
          MEDIO: 0,
          INFORMATIVO: 0,
        },
      },
    );
  }

  private emptyFeed(dto: ListAlertsDto) {
    return {
      ...paginated([], 0, dto),
      summary: this.summary([]),
    };
  }

  private lateDays(date: Date, now: Date) {
    return Math.max(1, Math.ceil((now.getTime() - date.getTime()) / DAY_MS));
  }

  private incidentSeverity(severity: string): AlertSeverity {
    if (severity === 'CRITICAL') return 'CRITICO';
    if (severity === 'HIGH') return 'ALTO';
    if (severity === 'MEDIUM') return 'MEDIO';
    return 'INFORMATIVO';
  }
}
