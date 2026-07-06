import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { RedisService } from '../redis/redis.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationType } from '@prisma/client';

/**
 * Distributed lock: garante que apenas UMA instância da API execute cada job
 * em deploys multi-instância (ex: Railway com 2+ replicas, Kubernetes).
 *
 * Sem lock, todas as instâncias disparam o job simultaneamente causando:
 * - Notificações duplicadas para usuários
 * - N×M queries ao banco (N instâncias × M registros)
 * - Emails duplicados
 *
 * Usa Redis SET NX EX (atomic) — o primeiro a gravar vence, os demais pulam.
 * TTL = duração máxima esperada do job + buffer de segurança.
 */
const LOCK_TTL: Record<string, number> = {
  'checklist-push': 5 * 60,       // 5 min
  'overdue-orders': 3 * 60,       // 3 min
  'maintenance-alerts': 2 * 60,   // 2 min
  'low-score-review': 10 * 60,    // 10 min (pode ter muitas execuções)
  'trial-expiry': 2 * 60,         // 2 min
  'past-due-expiry': 3 * 60,      // 3 min
  'wo-escalation': 3 * 60,        // 3 min (job horário)
  'critical-overdue': 3 * 60,     // 3 min (job diário)
  'document-status': 5 * 60,      // 5 min
};

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly redis: RedisService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * Tenta adquirir lock exclusivo para o job.
   * Retorna true se adquiriu (deve executar), false se outra instância já está rodando.
   */
  private async acquireLock(jobName: string): Promise<boolean> {
    const key = `scheduler:lock:${jobName}`;
    const ttl = LOCK_TTL[jobName] ?? 60;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // SET NX EX: só define se não existir — operação atômica do Redis
    // Inclui a data para que o lock expire naturalmente no próximo dia
    const acquired = await this.redis.setNX(`${key}:${today}`, '1', ttl);
    if (!acquired) {
      this.logger.debug(`[${jobName}] Lock não adquirido — outra instância está executando`);
    }
    return acquired;
  }

  /** Roda todo dia às 08:30 — push para checklists agendados para hoje */
  @Cron('30 8 * * *', { name: 'checklist-schedule-push', timeZone: 'America/Sao_Paulo' })
  async sendScheduledChecklistPush() {
    if (!await this.acquireLock('checklist-push')) return;
    this.logger.log('[checklist-push] Iniciando...');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const in7days = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.checklistSchedule.findMany({
      where: {
        isActive: true,
        nextDueAt: { lte: in7days },
        OR: [{ lastSentAt: null }, { lastSentAt: { lt: todayStart } }],
      },
      // Limite de segurança: evita OOM em produção com muitos tenants.
      // Para volumes acima de 500, implementar cursor-based pagination.
      take: 500,
      orderBy: { nextDueAt: 'asc' },
      include: {
        checklist: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
    });

    const due = candidates.filter((s) => {
      const notifyAt = new Date(
        s.nextDueAt.getTime() - (s.reminderDaysBefore ?? 0) * 24 * 60 * 60 * 1000,
      );
      return notifyAt <= todayEnd;
    });

    if (due.length === 0) {
      this.logger.log('[checklist-push] Nenhuma agenda para notificar');
      return;
    }

    this.logger.log(`[checklist-push] ${due.length} agenda(s) para notificar`);
    let sent = 0;
    const errors: string[] = [];

    for (const schedule of due) {
      try {
        const assetInfo = schedule.asset ? ` — ${schedule.asset.name}` : '';
        const daysUntil = Math.ceil(
          (schedule.nextDueAt.getTime() - todayEnd.getTime()) / (24 * 60 * 60 * 1000),
        );
        const whenLabel =
          daysUntil <= 0 ? 'hoje' : daysUntil === 1 ? 'amanhã' : `em ${daysUntil} dias`;
        const title =
          daysUntil <= 0 ? '📋 Checklist para hoje' : `📋 Lembrete: checklist ${whenLabel}`;
        const body = `${schedule.checklist.name}${assetInfo} — previsto para ${schedule.nextDueAt.toLocaleDateString('pt-BR')}`;

        if (schedule.assigneeId) {
          await this.push.sendToUser(schedule.assigneeId, schedule.companyId, {
            title, body,
            data: {
              screen: 'checklist',
              checklistId: schedule.checklist.id,
              assetId: schedule.asset?.id ?? null,
              scheduleId: schedule.id,
            },
          });

          await this.notifications.create({
            companyId: schedule.companyId,
            userId: schedule.assigneeId,
            type: NotificationType.CHECKLIST_DUE,
            title, body,
            data: {
              checklistId: schedule.checklist.id,
              assetId: schedule.asset?.id,
              scheduleId: schedule.id,
            },
          });
        }

        await this.prisma.checklistSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: new Date() },
        });
        sent++;
      } catch (err) {
        errors.push(`schedule ${schedule.id}: ${String(err)}`);
      }
    }

    this.logger.log(`[checklist-push] Concluído: ${sent} enviados, ${errors.length} falhas`);
    if (errors.length > 0) {
      this.logger.error(`[checklist-push] Falhas:\n${errors.join('\n')}`);
    }
  }

  /** Roda todo dia às 08:00 — alerta de OS vencidas */
  @Cron('0 8 * * *', { name: 'overdue-work-orders', timeZone: 'America/Sao_Paulo' })
  async alertOverdueWorkOrders() {
    if (!await this.acquireLock('overdue-orders')) return;
    this.logger.log('[overdue-orders] Verificando OSs vencidas...');

    const now = new Date();

    const overdueWOs = await this.prisma.workOrder.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      // Limite de segurança: evita OOM em produção com muitos tenants.
      // Para volumes acima de 500, implementar cursor-based pagination.
      take: 500,
      orderBy: { dueDate: 'asc' },
      include: {
        company: { select: { id: true, name: true, email: true } },
        unit: { select: { name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, email: true } },
      },
    });

    if (overdueWOs.length === 0) {
      this.logger.log('[overdue-orders] Nenhuma OS vencida');
      return;
    }

    const byCompany = new Map<string, typeof overdueWOs>();
    for (const wo of overdueWOs) {
      const list = byCompany.get(wo.companyId) ?? [];
      list.push(wo);
      byCompany.set(wo.companyId, list);
    }

    for (const [companyId, wos] of byCompany.entries()) {
      const company = wos[0].company;

      for (const wo of wos) {
        if (wo.assigneeId) {
          await this.notifications.create({
            companyId,
            userId: wo.assigneeId,
            type: NotificationType.WORK_ORDER_ASSIGNED,
            title: `⚠️ OS vencida: ${wo.code}`,
            body: `"${wo.title}" está vencida. Providencie o atendimento.`,
            data: { workOrderId: wo.id },
          }).catch((err) => this.logger.error(`Notificação OS ${wo.id}: ${err}`));
        }
      }

      const managers = await this.prisma.user.findMany({
        where: { companyId, role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
        select: { email: true },
      });

      if (managers.length > 0 && this.email.isEnabled()) {
        await this.email.sendWorkOrderOverdue({
          to: managers.map((m) => m.email),
          woCode: wos.length === 1 ? wos[0].code : `${wos.length} OSs`,
          woTitle: wos.length === 1 ? wos[0].title : `${wos.length} ordens de serviço vencidas`,
          dueDate: wos[0].dueDate ? new Date(wos[0].dueDate).toLocaleDateString('pt-BR') : '—',
          assigneeName: wos[0].assignee?.name,
          companyName: company.name,
        }).catch((err) => this.logger.error(`Email overdue ${companyId}: ${err}`));
      }

      this.logger.log(`[overdue-orders] ${wos.length} OS(s) vencidas em ${company.name}`);
    }
  }

  /** Roda todo dia às 07:00 — alerta de manutenções nos próximos 7 dias */
  @Cron('0 7 * * *', { name: 'maintenance-alerts', timeZone: 'America/Sao_Paulo' })
  async alertUpcomingMaintenance() {
    if (!await this.acquireLock('maintenance-alerts')) return;
    this.logger.log('[maintenance-alerts] Verificando manutenções próximas...');

    const now = new Date();
    const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const assets = await this.prisma.asset.findMany({
      where: { status: 'ACTIVE', nextMaintenanceAt: { gte: now, lte: in7days } },
      // Limite de segurança: evita OOM em produção com muitos tenants.
      take: 500,
      orderBy: { nextMaintenanceAt: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
        unit: { select: { name: true } },
      },
    });

    if (assets.length === 0) {
      this.logger.log('[maintenance-alerts] Nenhuma manutenção próxima');
      return;
    }

    const byCompany = new Map<string, typeof assets>();
    for (const asset of assets) {
      const list = byCompany.get(asset.companyId) ?? [];
      list.push(asset);
      byCompany.set(asset.companyId, list);
    }

    for (const [companyId, companyAssets] of byCompany.entries()) {
      await this.notifications
        .notifyManagers(
          companyId,
          NotificationType.ASSET_ALERT,
          `🔧 ${companyAssets.length} equipamento(s) com manutenção em até 7 dias`,
          companyAssets.map((a) => `${a.name} (${a.unit.name})`).join(', '),
          { assetIds: companyAssets.map((a) => a.id) },
        )
        .catch((err) => this.logger.error(`Alerta manutenção ${companyId}: ${err}`));

      this.logger.log(
        `[maintenance-alerts] ${companyAssets.length} equipamentos em ${companyAssets[0].company.name}`,
      );
    }
  }

  /** Roda toda segunda às 09:00 — execuções com baixa conformidade (<70%) */
  @Cron('0 9 * * 1', { name: 'low-score-review', timeZone: 'America/Sao_Paulo' })
  async alertLowScoreExecutions() {
    if (!await this.acquireLock('low-score-review')) return;
    this.logger.log('[low-score-review] Verificando execuções com baixo score...');

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const lowScore = await this.prisma.execution.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: since }, score: { lt: 70, not: null } },
      // Limite de segurança: evita OOM em produção com muitos tenants.
      take: 500,
      orderBy: { completedAt: 'desc' },
      include: {
        checklist: { select: { name: true } },
        user: { select: { name: true, email: true } },
        company: { select: { id: true, name: true } },
        asset: { select: { name: true } },
      },
    });

    if (lowScore.length === 0) {
      this.logger.log('[low-score-review] Nenhuma execução com score baixo');
      return;
    }

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
        }).catch((err) => this.logger.error(`Email low-score ${exec.id}: ${err}`));
      }

      await this.notifications
        .notifyManagers(
          exec.companyId,
          NotificationType.CHECKLIST_DUE,
          `📋 Baixa conformidade: ${exec.score?.toFixed(0)}%`,
          `Checklist "${exec.checklist.name}" por ${exec.user.name}`,
          { executionId: exec.id },
        )
        .catch((err) => this.logger.error(`Notificação low-score ${exec.id}: ${err}`));
    }

    this.logger.log(`[low-score-review] ${lowScore.length} execuções com score < 70% alertadas`);
  }

  /**
   * Roda todo dia às 09:00 — expira trials vencidos.
   * Tenants com trial expirado há mais de 1 dia → SUSPENDED (não pausa, bloqueia).
   * O JwtStrategy já rejeita tokens de trials expirados com mensagem clara.
   */
  @Cron('0 9 * * *', { name: 'trial-expiry', timeZone: 'America/Sao_Paulo' })
  async expireTrials() {
    if (!await this.acquireLock('trial-expiry')) return;
    this.logger.log('[trial-expiry] Verificando trials expirados...');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.prisma as any;

    const expired = await db.company.findMany({
      where: {
        subscriptionStatus: 'TRIAL',
        trialEndsAt: { lt: yesterday },
        isActive: true,
      },
      select: { id: true, name: true, email: true },
      take: 200,
    });

    if (expired.length === 0) {
      this.logger.log('[trial-expiry] Nenhum trial expirado');
      return;
    }

    for (const company of expired) {
      await db.company
        .update({
          where: { id: company.id },
          data: { subscriptionStatus: 'SUSPENDED' },
        })
        .catch((err: unknown) => this.logger.error(`Erro ao expirar trial ${company.id}: ${err}`));

      await this.prisma.auditLog
        .create({
          data: {
            companyId: company.id,
            action: 'TRIAL_EXPIRED',
            resource: 'subscription',
          },
        })
        .catch(() => {});
    }

    this.logger.log(`[trial-expiry] ${expired.length} trial(s) expirado(s) → SUSPENDED`);
  }

  /**
   * Roda a cada hora — OS HIGH/CRITICAL sem atualização há 24h → notifica gestores.
   * O lock usa TTL de 3 min; após expirar, a próxima hora pode adquiri-lo novamente.
   */
  @Cron('0 * * * *', { name: 'wo-escalation', timeZone: 'America/Sao_Paulo' })
  async escalateStaleWorkOrders() {
    if (!await this.acquireLock('wo-escalation')) return;
    this.logger.log('[wo-escalation] Verificando OS paradas...');

    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await this.prisma.workOrder.findMany({
      where: {
        priority: { in: ['HIGH', 'CRITICAL'] },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        updatedAt: { lt: threshold },
      },
      take: 200,
      include: {
        company: { select: { id: true } },
        unit: { select: { name: true } },
      },
    });

    if (stale.length === 0) {
      this.logger.log('[wo-escalation] Nenhuma OS parada');
      return;
    }

    const byCompany = new Map<string, typeof stale>();
    for (const wo of stale) {
      const list = byCompany.get(wo.companyId) ?? [];
      list.push(wo);
      byCompany.set(wo.companyId, list);
    }

    for (const [companyId, wos] of byCompany.entries()) {
      for (const wo of wos) {
        await this.notifications
          .notifyManagers(
            companyId,
            NotificationType.WORK_ORDER_ASSIGNED,
            `⏰ OS parada há +24h: ${wo.code}`,
            `"${wo.title}" (${wo.priority}) — ${wo.unit.name} — sem atualização há mais de 24h`,
            { workOrderId: wo.id },
          )
          .catch((err) => this.logger.error(`Escalonamento WO ${wo.id}: ${err}`));
      }
    }

    this.logger.log(`[wo-escalation] ${stale.length} OS(s) escaladas`);
  }

  /**
   * Roda todo dia às 11:00 — OS vencidas há mais de 3 dias → alerta crítico.
   */
  @Cron('0 11 * * *', { name: 'critical-overdue', timeZone: 'America/Sao_Paulo' })
  async alertCriticallyOverdueWorkOrders() {
    if (!await this.acquireLock('critical-overdue')) return;
    this.logger.log('[critical-overdue] Verificando OS criticamente vencidas...');

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const critical = await this.prisma.workOrder.findMany({
      where: {
        dueDate: { lt: threeDaysAgo },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      take: 200,
      include: {
        company: { select: { id: true, name: true } },
        unit: { select: { name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    if (critical.length === 0) {
      this.logger.log('[critical-overdue] Nenhuma OS criticamente vencida');
      return;
    }

    const byCompany = new Map<string, typeof critical>();
    for (const wo of critical) {
      const list = byCompany.get(wo.companyId) ?? [];
      list.push(wo);
      byCompany.set(wo.companyId, list);
    }

    for (const [companyId, wos] of byCompany.entries()) {
      await this.notifications
        .notifyManagers(
          companyId,
          NotificationType.WORK_ORDER_ASSIGNED,
          `🚨 ${wos.length} OS vencida(s) há mais de 3 dias`,
          wos.map((w) => `${w.code} — ${w.title}`).join(', '),
          { workOrderIds: wos.map((w) => w.id) },
        )
        .catch((err) => this.logger.error(`Alerta overdue crítico ${companyId}: ${err}`));

      this.logger.log(`[critical-overdue] ${wos.length} OS críticas em ${wos[0].company.name}`);
    }
  }

  /**
   * Roda todo dia às 10:30 — safety net para PAST_DUE → SUSPENDED.
   *
   * Razão de existir: o Stripe é a fonte de verdade para mudanças de status,
   * mas webhooks podem falhar (timeout, downtime). Se uma empresa ficou PAST_DUE
   * há mais de 10 dias (além do ciclo de retry do Stripe), algo deu errado.
   * Este job resolve o estado sem depender de webhooks chegarem.
   *
   * 10 dias = ciclo máximo de retry do Stripe (configurável no Dashboard).
   */
  @Cron('30 10 * * *', { name: 'past-due-expiry', timeZone: 'America/Sao_Paulo' })
  async expirePastDue() {
    if (!await this.acquireLock('past-due-expiry')) return;
    this.logger.log('[past-due-expiry] Verificando empresas PAST_DUE expiradas...');

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Busca empresas PAST_DUE cujo pastDueSince ultrapassou 10 dias
    const stale = await db.company.findMany({
      where: {
        subscriptionStatus: 'PAST_DUE',
        pastDueSince: { lt: tenDaysAgo, not: null },
        isActive: true,
      },
      select: { id: true, name: true },
      take: 100,
    });

    if (stale.length === 0) {
      this.logger.log('[past-due-expiry] Nenhuma empresa PAST_DUE expirada');
      return;
    }

    for (const company of stale) {
      await db.company
        .update({
          where: { id: company.id },
          data: { subscriptionStatus: 'SUSPENDED', pastDueSince: null },
        })
        .catch((err: unknown) => this.logger.error(`Erro ao suspender ${company.id}: ${err}`));

      await this.prisma.auditLog
        .create({
          data: {
            companyId: company.id,
            action: 'SUBSCRIPTION_SUSPENDED_SAFETY_NET',
            resource: 'subscription',
          },
        })
        .catch(() => {});
    }

    this.logger.log(`[past-due-expiry] ${stale.length} empresa(s) PAST_DUE → SUSPENDED (safety net)`);
  }

  /** Roda todo dia às 07:00 — atualiza status de documentos e notifica vencimentos */
  @Cron('0 7 * * *', { name: 'document-status-refresh', timeZone: 'America/Sao_Paulo' })
  async refreshDocumentStatuses() {
    if (!await this.acquireLock('document-status')) return;
    this.logger.log('[document-status] Iniciando atualização de status de documentos...');

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let totalUpdated = 0;
    for (const company of companies) {
      try {
        const result = await this.documents.refreshStatuses(company.id);
        totalUpdated += result.updated;

        // Notifica gestores sobre documentos EXPIRING_SOON e EXPIRED
        const alertDocs = await this.prisma.document.findMany({
          where: {
            companyId: company.id,
            isActive: true,
            status: { in: ['EXPIRING_SOON', 'EXPIRED'] },
          },
          select: { id: true, name: true, status: true, expiryDate: true, unitId: true },
          take: 20,
        });

        if (alertDocs.length === 0) continue;

        const managers = await this.prisma.user.findMany({
          where: {
            companyId: company.id,
            isActive: true,
            role: { in: ['OWNER', 'ADMIN', 'GESTOR'] },
          },
          select: { id: true },
        });

        for (const doc of alertDocs) {
          const isExpired = doc.status === 'EXPIRED';
          const label = isExpired ? 'VENCIDO' : 'vence em breve';
          const title = `Documento ${label}: ${doc.name}`;
          const expiryStr = doc.expiryDate ? doc.expiryDate.toLocaleDateString('pt-BR') : 'sem data';
          const body = `Validade: ${expiryStr}`;
          for (const mgr of managers) {
            await this.notifications.create({
              companyId: company.id,
              userId: mgr.id,
              type: NotificationType.SYSTEM,
              title,
              body,
              data: { documentId: doc.id },
            }).catch(() => {});
          }
        }
      } catch (err) {
        this.logger.error(`[document-status] Erro na empresa ${company.id}: ${err}`);
      }
    }

    this.logger.log(`[document-status] ${totalUpdated} documento(s) atualizados em ${companies.length} empresa(s)`);
  }

  /** Segunda-feira às 09:00 — resumo semanal para OWNERs/ADMINs */
  @Cron('0 9 * * 1', { name: 'weekly-summary', timeZone: 'America/Sao_Paulo' })
  async sendWeeklySummaryEmails() {
    if (!await this.acquireLock('document-status')) return; // reusar lock key simplificada
    this.logger.log('[weekly-summary] Iniciando envio de resumos semanais...');

    const companies = await this.prisma.company.findMany({
      where: { isActive: true, subscriptionStatus: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true, name: true },
    });

    let sent = 0;
    for (const company of companies) {
      try {
        const [openWOs, completedWOs, overdueWOs, openIncidents, pendingChecklists, owners] = await Promise.all([
          this.prisma.workOrder.count({
            where: { companyId: company.id, deletedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          }),
          this.prisma.workOrder.count({
            where: {
              companyId: company.id,
              status: 'COMPLETED',
              completedAt: { gte: new Date(Date.now() - 7 * 24 * 3600000) },
            },
          }),
          this.prisma.workOrder.count({
            where: {
              companyId: company.id,
              deletedAt: null,
              dueDate: { lt: new Date() },
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
          }),
          this.prisma.incident.count({
            where: { companyId: company.id, status: { notIn: ['RESOLVED', 'CLOSED'] } },
          }),
          this.prisma.checklistSchedule.count({
            where: {
              companyId: company.id,
              isActive: true,
              nextDueAt: {
                gte: new Date(),
                lte: new Date(Date.now() + 7 * 24 * 3600000),
              },
            },
          }),
          this.prisma.user.findMany({
            where: {
              companyId: company.id,
              isActive: true,
              role: { in: ['OWNER', 'ADMIN'] },
            },
            select: { id: true, name: true, email: true },
          }),
        ]);

        for (const owner of owners) {
          await this.email.sendWeeklySummary({
            to: owner.email,
            name: owner.name,
            companyName: company.name,
            openWOs, completedWOs, overdueWOs, openIncidents, pendingChecklists,
          }).catch(() => {});
          sent++;
        }
      } catch (err) {
        this.logger.error(`[weekly-summary] Erro empresa ${company.id}: ${err}`);
      }
    }

    this.logger.log(`[weekly-summary] Resumos enviados para ${sent} usuário(s)`);
  }

  /** Diariamente às 10:00 — alertas de trial expirando (7, 3, 1 dias) */
  @Cron('0 10 * * *', { name: 'trial-expiry-email', timeZone: 'America/Sao_Paulo' })
  async sendTrialExpiryEmails() {
    const alertDays = [7, 3, 1];
    const now = new Date();

    for (const days of alertDays) {
      const from = new Date(now);
      from.setDate(from.getDate() + days);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setHours(23, 59, 59, 999);

      const companies = await this.prisma.company.findMany({
        where: {
          subscriptionStatus: 'TRIAL',
          trialEndsAt: { gte: from, lte: to },
          isActive: true,
        },
        select: { id: true, name: true },
      });

      for (const company of companies) {
        const owners = await this.prisma.user.findMany({
          where: { companyId: company.id, role: 'OWNER', isActive: true },
          select: { name: true, email: true },
        });

        for (const owner of owners) {
          await this.email.sendTrialExpiring({
            to: owner.email,
            name: owner.name,
            companyName: company.name,
            daysLeft: days,
          }).catch(() => {});
        }
      }
    }

    this.logger.log('[trial-expiry-email] Alertas de trial processados');
  }
}
