import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Roda todo dia às 08:00 — alerta de OS vencidas */
  @Cron('0 8 * * *', { name: 'overdue-work-orders', timeZone: 'America/Sao_Paulo' })
  async alertOverdueWorkOrders() {
    this.logger.log('Verificando OSs vencidas...');
    const now = new Date();

    const overdueWOs = await this.prisma.workOrder.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        company: { select: { id: true, name: true, email: true } },
        unit: { select: { name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, email: true } },
      },
    });

    if (overdueWOs.length === 0) return;

    // Agrupar por empresa
    const byCompany = new Map<string, typeof overdueWOs>();
    for (const wo of overdueWOs) {
      const list = byCompany.get(wo.companyId) ?? [];
      list.push(wo);
      byCompany.set(wo.companyId, list);
    }

    for (const [companyId, wos] of byCompany.entries()) {
      const company = wos[0].company;

      // Notificação no app para cada OS
      for (const wo of wos) {
        if (wo.assigneeId) {
          await this.notifications.create({
            companyId,
            userId: wo.assigneeId,
            type: NotificationType.WORK_ORDER_ASSIGNED,
            title: `⚠️ OS vencida: ${wo.code}`,
            body: `"${wo.title}" está vencida. Providencie o atendimento.`,
            data: { workOrderId: wo.id },
          });
        }
      }

      // Email para os gestores
      const managers = await this.prisma.user.findMany({
        where: { companyId, role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
        select: { email: true },
      });

      if (managers.length > 0 && this.email.isEnabled()) {
        const emails = managers.map((m) => m.email);
        const dueDate = wos[0].dueDate
          ? new Date(wos[0].dueDate).toLocaleDateString('pt-BR')
          : '—';

        await this.email.sendWorkOrderOverdue({
          to: emails,
          woCode: wos.length === 1 ? wos[0].code : `${wos.length} OSs`,
          woTitle: wos.length === 1 ? wos[0].title : `${wos.length} ordens de serviço vencidas`,
          dueDate,
          assigneeName: wos[0].assignee?.name,
          companyName: company.name,
        });
      }

      this.logger.log(`${wos.length} OS(s) vencidas em ${company.name} — alertas enviados`);
    }
  }

  /** Roda todo dia às 07:00 — alerta de manutenções nos próximos 7 dias */
  @Cron('0 7 * * *', { name: 'maintenance-alerts', timeZone: 'America/Sao_Paulo' })
  async alertUpcomingMaintenance() {
    this.logger.log('Verificando manutenções próximas...');
    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const assetsNeedingMaint = await this.prisma.asset.findMany({
      where: {
        status: 'ACTIVE',
        nextMaintenanceAt: { gte: now, lte: in7days },
      },
      include: {
        company: { select: { id: true, name: true } },
        unit: { select: { name: true } },
      },
    });

    if (assetsNeedingMaint.length === 0) return;

    const byCompany = new Map<string, typeof assetsNeedingMaint>();
    for (const asset of assetsNeedingMaint) {
      const list = byCompany.get(asset.companyId) ?? [];
      list.push(asset);
      byCompany.set(asset.companyId, list);
    }

    for (const [companyId, assets] of byCompany.entries()) {
      await this.notifications.notifyManagers(
        companyId,
        NotificationType.ASSET_ALERT,
        `🔧 ${assets.length} equipamento(s) com manutenção em até 7 dias`,
        assets.map((a) => `${a.name} (${a.unit.name})`).join(', '),
        { assetIds: assets.map((a) => a.id) },
      );
      this.logger.log(`Alertas de manutenção enviados para ${assets[0].company.name}: ${assets.length} equipamentos`);
    }
  }

  /** Roda toda segunda às 09:00 — verificar execuções com baixa conformidade */
  @Cron('0 9 * * 1', { name: 'low-score-review', timeZone: 'America/Sao_Paulo' })
  async alertLowScoreExecutions() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const lowScore = await this.prisma.execution.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: since },
        score: { lt: 70, not: null },
      },
      include: {
        checklist: { select: { name: true } },
        user: { select: { name: true, email: true } },
        company: { select: { id: true, name: true } },
        asset: { select: { name: true } },
      },
    });

    for (const exec of lowScore) {
      const managers = await this.prisma.user.findMany({
        where: { companyId: exec.companyId, role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
        select: { email: true },
      });

      if (managers.length > 0 && this.email.isEnabled()) {
        await this.email.sendLowScoreExecution({
          to: managers.map((m) => m.email),
          checklistName: exec.checklist.name,
          score: exec.score ?? 0,
          technicianName: exec.user.name,
          assetName: exec.asset?.name,
          companyName: exec.company.name,
        });
      }

      await this.notifications.notifyManagers(
        exec.companyId,
        NotificationType.CHECKLIST_DUE,
        `📋 Baixa conformidade: ${exec.score?.toFixed(0)}%`,
        `Checklist "${exec.checklist.name}" por ${exec.user.name}`,
        { executionId: exec.id },
      );
    }

    if (lowScore.length > 0) {
      this.logger.log(`${lowScore.length} execuções com score < 70% alertadas`);
    }
  }
}
