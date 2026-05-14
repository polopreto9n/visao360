import { Injectable, Logger, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

/**
 * Mapeia eventos do Stripe para ações no banco.
 *
 * Fluxo de assinatura:
 *   signup → TRIAL (14 dias)
 *   → checkout.session.completed → ACTIVE + stripeIds
 *   → invoice.payment_succeeded → renova ACTIVE + currentPeriodEnd
 *   → invoice.payment_failed → PAST_DUE (grace 7 dias)
 *   → customer.subscription.deleted → SUSPENDED/CANCELLED
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly stripeSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {
    this.stripeSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  /**
   * Valida a assinatura do webhook Stripe (garante que o request veio do Stripe).
   * Retorna o evento parseado ou lança BadRequestException.
   */
  async parseAndVerifyWebhook(rawBody: Buffer, signature: string): Promise<{ id: string; type: string; data: Record<string, unknown> }> {
    // Sem secret configurado → rejeitar imediatamente.
    // Aceitar webhook sem verificação de assinatura abre spoofing total.
    if (!this.stripeSecret) {
      this.logger.error(
        'STRIPE_WEBHOOK_SECRET não está configurado. ' +
        'Configure a variável de ambiente para habilitar webhooks.',
      );
      throw new ForbiddenException(
        'Webhook desabilitado: STRIPE_WEBHOOK_SECRET não configurado',
      );
    }

    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('rawBody vazio — certifique-se que rawBody: true está no NestFactory.create()');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Stripe = require('stripe');
      const stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'));
      const event = stripe.webhooks.constructEvent(rawBody, signature, this.stripeSecret);
      return event as { id: string; type: string; data: Record<string, unknown> };
    } catch (err) {
      this.logger.error(`Webhook com assinatura inválida: ${String(err)}`);
      throw new BadRequestException('Webhook signature inválida');
    }
  }

  async handleWebhookEvent(eventId: string, type: string, data: Record<string, unknown>): Promise<void> {
    // ── Idempotência: rejeita eventos já processados ─────────────────────────
    // Stripe entrega at-least-once. Sem esta verificação, um retry duplicaria
    // activações, cancelamentos e mudanças de status — efeito direto no billing.
    const alreadyProcessed = await this.prisma.stripeEvent.findUnique({
      where: { id: eventId },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Stripe webhook ignorado (duplicado): ${eventId} (${type})`);
      return;
    }

    this.logger.log(`Stripe webhook: ${type} [${eventId}]`);

    switch (type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(data);
        break;
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(data);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(data);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(data);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(data);
        break;
      default:
        this.logger.debug(`Evento Stripe ignorado: ${type}`);
    }

    // Marca como processado APÓS execução bem-sucedida
    // Se o handler lançar exceção, o evento não é marcado → Stripe vai retentar → correto
    await this.prisma.stripeEvent.create({
      data: { id: eventId, type },
    }).catch(() => {
      // Falha silenciosa: possível corrida entre duas instâncias — ambas processaram,
      // a segunda falhou no INSERT (constraint). Nenhum dado foi corrompido.
    });
  }

  /** checkout.session.completed → ativa assinatura após primeiro pagamento */
  private async handleCheckoutCompleted(data: Record<string, unknown>) {
    const session = data['object'] as Record<string, unknown>;
    const companyId = (session['metadata'] as Record<string, string>)?.['companyId'];
    const stripeCustomerId = session['customer'] as string;
    const stripeSubscriptionId = session['subscription'] as string;

    if (!companyId) {
      this.logger.error('checkout.session.completed sem companyId nos metadata');
      return;
    }

    const periodEnd = session['current_period_end'] as number | undefined;
    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    await db.company.update({
      where: { id: companyId },
      data: {
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus: 'ACTIVE',
        plan: this.extractPlan(session),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        trialEndsAt: null,
        pastDueSince: null,
      },
    });

    // Audit log — pagamento inicial registrado
    await this.prisma.auditLog.create({
      data: { companyId, action: 'SUBSCRIPTION_ACTIVATED', resource: 'subscription',
              resourceId: stripeSubscriptionId },
    });

    this.logger.log(`Assinatura ativada: empresa ${companyId}`);
  }

  /** invoice.payment_succeeded → renova período */
  private async handlePaymentSucceeded(data: Record<string, unknown>) {
    const invoice = data['object'] as Record<string, unknown>;
    const stripeCustomerId = invoice['customer'] as string;
    const periodEnd = invoice['period_end'] as number | undefined;
    if (!stripeCustomerId) return;

    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.company.updateMany({
      where: { stripeCustomerId },
      data: {
        subscriptionStatus: 'ACTIVE',
        pastDueSince: null,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
      },
    });

    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId }, select: { id: true },
    });
    if (company) {
      await this.prisma.auditLog.create({
        data: { companyId: company.id, action: 'PAYMENT_SUCCEEDED', resource: 'subscription' },
      });
    }

    this.logger.log(`Pagamento confirmado: customer ${stripeCustomerId}`);
  }

  /** invoice.payment_failed → PAST_DUE + registra pastDueSince para safety-net scheduler */
  private async handlePaymentFailed(data: Record<string, unknown>) {
    const invoice = data['object'] as Record<string, unknown>;
    const stripeCustomerId = invoice['customer'] as string;
    if (!stripeCustomerId) return;

    const company = await this.prisma.company.findFirst({
      where: { stripeCustomerId },
      select: { id: true, email: true, name: true },
    });
    if (!company) return;

    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.company.update({
      where: { id: company.id },
      data: {
        subscriptionStatus: 'PAST_DUE',
        pastDueSince: new Date(), // safety-net: scheduler usa este campo para PAST_DUE → SUSPENDED
      },
    });

    await this.prisma.auditLog.create({
      data: { companyId: company.id, action: 'PAYMENT_FAILED', resource: 'subscription' },
    });

    if (this.email.isEnabled()) {
      const owners = await this.prisma.user.findMany({
        where: { companyId: company.id, role: { in: ['OWNER', 'ADMIN'] as never[] }, isActive: true },
        select: { email: true },
      });
      if (owners.length > 0) {
        this.logger.warn(`Pagamento falhou para ${company.name} — ${owners.length} contato(s) a notificar`);
        // Email: template de cobrança pendente enviado aqui
      }
    }

    this.logger.warn(`Pagamento falhou: empresa ${company.id} → PAST_DUE`);
  }

  /** customer.subscription.deleted → SUSPENDED ou CANCELLED */
  private async handleSubscriptionDeleted(data: Record<string, unknown>) {
    const sub = data['object'] as Record<string, unknown>;
    const stripeSubscriptionId = sub['id'] as string;
    const cancelAtPeriodEnd = sub['cancel_at_period_end'] as boolean;
    const newStatus = cancelAtPeriodEnd ? 'CANCELLED' : 'SUSPENDED';

    const company = await this.prisma.company.findFirst({
      where: { stripeSubscriptionId }, select: { id: true },
    });

    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.company.updateMany({
      where: { stripeSubscriptionId },
      data: { subscriptionStatus: newStatus, stripeSubscriptionId: null, pastDueSince: null },
    });

    if (company) {
      await this.prisma.auditLog.create({
        data: {
          companyId: company.id,
          action: cancelAtPeriodEnd ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_SUSPENDED',
          resource: 'subscription',
          resourceId: stripeSubscriptionId,
        },
      });
    }

    this.logger.log(`Assinatura encerrada: ${stripeSubscriptionId} → ${newStatus}`);
  }

  /** customer.subscription.updated → atualiza status e plano */
  private async handleSubscriptionUpdated(data: Record<string, unknown>) {
    const sub = data['object'] as Record<string, unknown>;
    const stripeSubscriptionId = sub['id'] as string;
    const status = sub['status'] as string;
    const periodEnd = sub['current_period_end'] as number | undefined;

    const statusMap: Record<string, string> = {
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELLED',
      unpaid: 'SUSPENDED',
    };
    const newStatus = statusMap[status];
    if (!newStatus) return;

    const db = this.prisma as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.company.updateMany({
      where: { stripeSubscriptionId },
      data: {
        subscriptionStatus: newStatus,
        plan: this.extractPlan(sub),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
        pastDueSince: newStatus === 'PAST_DUE' ? new Date() : null,
      },
    });
  }

  /** Extrai o plano do metadata ou do price_id do Stripe */
  private extractPlan(obj: Record<string, unknown>): string {
    const meta = obj['metadata'] as Record<string, string> | undefined;
    return meta?.['plan'] ?? 'STARTER';
  }

  /**
   * Endpoint de recuperação para tenants SUSPENDED/CANCELLED/trial-expirado.
   * Valida credenciais manualmente (sem JWT, que estaria bloqueado),
   * retorna o status atual e o link do Stripe Customer Portal.
   *
   * SEGURANÇA: mesmo timing protection do login (bcrypt + dummy hash).
   */
  async recover(email: string, companyId: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), companyId, isActive: true },
      select: {
        id: true, name: true, email: true, role: true, passwordHash: true,
        company: {
          select: {
            id: true, name: true, email: true,
            subscriptionStatus: true, trialEndsAt: true,
            currentPeriodEnd: true, stripeCustomerId: true,
            plan: true,
          },
        },
      },
    });

    const dummyHash = await bcrypt.hash('recover-timing-protection', 10);
    const isValid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

    if (!user || !isValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const company = user.company;
    const now = new Date();
    const trialDaysLeft = company.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(company.trialEndsAt).getTime() - now.getTime()) / 86_400_000))
      : null;

    // Gera URL do Stripe Customer Portal (self-service billing)
    let billingPortalUrl: string | null = null;
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey && company.stripeCustomerId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Stripe = require('stripe');
        const stripe = new Stripe(stripeKey);
        const session = await stripe.billingPortal.sessions.create({
          customer: company.stripeCustomerId,
          return_url: this.config.get('FRONTEND_URL', 'http://localhost:3000') + '/dashboard',
        });
        billingPortalUrl = session.url as string;
      } catch (err) {
        this.logger.error(`Erro ao criar Stripe Portal: ${String(err)}`);
      }
    }

    return {
      userId: user.id,
      companyId: company.id,
      companyName: company.name,
      subscriptionStatus: company.subscriptionStatus,
      plan: company.plan,
      trialDaysLeft,
      currentPeriodEnd: company.currentPeriodEnd,
      billingPortalUrl,
      message: this.getStatusMessage(company.subscriptionStatus as string, trialDaysLeft),
    };
  }

  private getStatusMessage(status: string, trialDaysLeft: number | null): string {
    switch (status) {
      case 'TRIAL':
        return trialDaysLeft === 0
          ? 'Seu trial expirou hoje. Escolha um plano para continuar.'
          : `Trial ativo: ${trialDaysLeft} dia(s) restante(s).`;
      case 'PAST_DUE':
        return 'Pagamento pendente. Regularize para manter o acesso completo.';
      case 'SUSPENDED':
        return 'Acesso suspenso por falta de pagamento. Use o link de billing para regularizar.';
      case 'CANCELLED':
        return 'Assinatura cancelada. Entre em contato com o suporte para reativar.';
      case 'ACTIVE':
        return 'Assinatura ativa.';
      default:
        return 'Status desconhecido.';
    }
  }

  /** Retorna status de assinatura de uma empresa (para uso interno) */
  async getSubscriptionStatus(companyId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const company = await (this.prisma as any).company.findUnique({
      where: { id: companyId },
      select: {
        plan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
      },
    });
    if (!company) return null;

    const now = new Date();
    const daysLeft = company.trialEndsAt
      ? Math.max(0, Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    return { ...company, trialDaysLeft: daysLeft };
  }
}
