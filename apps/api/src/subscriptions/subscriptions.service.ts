import {
  Injectable, Logger, BadRequestException, ForbiddenException,
  UnauthorizedException, NotFoundException, InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import Stripe from 'stripe';
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
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = stripeKey ? new Stripe(stripeKey) : null;
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  async parseAndVerifyWebhook(rawBody: Buffer, signature: string): Promise<{ id: string; type: string; data: Record<string, unknown> }> {
    if (!this.webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET não configurado.');
      throw new ForbiddenException('Webhook desabilitado: STRIPE_WEBHOOK_SECRET não configurado');
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('rawBody vazio — certifique-se que rawBody: true está no NestFactory.create()');
    }
    if (!this.stripe) {
      throw new ForbiddenException('Stripe não configurado: STRIPE_SECRET_KEY ausente');
    }
    try {
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      return event as { id: string; type: string; data: Record<string, unknown> };
    } catch (err) {
      this.logger.error(`Webhook com assinatura inválida: ${String(err)}`);
      throw new BadRequestException('Webhook signature inválida');
    }
  }

  async handleWebhookEvent(eventId: string, type: string, data: Record<string, unknown>): Promise<void> {
    // Idempotência: rejeita eventos já processados
    const alreadyProcessed = await this.prisma.stripeEvent.findUnique({ where: { id: eventId } });
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

    await this.prisma.stripeEvent.create({
      data: { id: eventId, type },
    }).catch(() => {
      // Corrida entre instâncias — ambas processaram, segunda falhou no INSERT. OK.
    });
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────

  async createCheckoutSession(companyId: string, plan: string): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new ForbiddenException('Pagamentos não configurados neste ambiente');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, email: true, stripeCustomerId: true, subscriptionStatus: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    if (company.subscriptionStatus === 'ACTIVE') {
      throw new ForbiddenException('Assinatura já ativa. Use o portal de billing para alterar o plano.');
    }
    if (company.subscriptionStatus === 'SUSPENDED' || company.subscriptionStatus === 'CANCELLED') {
      throw new ForbiddenException('Use o fluxo de recuperação (/recuperar) para reativar a conta.');
    }

    const priceId = this.getPriceId(plan);

    // Reutiliza customer existente ou cria novo
    let customerId = company.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: company.email,
        name: company.name,
        metadata: { companyId },
      });
      customerId = customer.id;
      // Persiste imediatamente para evitar duplicatas em retrys
      await this.prisma.company.update({ where: { id: companyId }, data: { stripeCustomerId: customerId } });
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { companyId, plan },
      subscription_data: { metadata: { companyId, plan } },
      success_url: `${frontendUrl}/planos/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/planos/cancelado`,
      allow_promotion_codes: true,
    });

    if (!session.url) throw new InternalServerErrorException('Stripe não retornou URL de checkout');
    return { url: session.url };
  }

  async createBillingPortalSession(companyId: string): Promise<{ url: string }> {
    if (!this.stripe) {
      throw new ForbiddenException('Pagamentos não configurados neste ambiente');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { stripeCustomerId: true },
    });

    if (!company?.stripeCustomerId) {
      throw new ForbiddenException('Nenhuma assinatura Stripe associada a esta conta');
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard/conta`,
    });

    return { url: session.url };
  }

  // ─── Webhook handlers ─────────────────────────────────────────────────────

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

    await this.prisma.auditLog.create({
      data: { companyId, action: 'SUBSCRIPTION_ACTIVATED', resource: 'subscription', resourceId: stripeSubscriptionId },
    });

    this.logger.log(`Assinatura ativada: empresa ${companyId}`);
  }

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
      data: { subscriptionStatus: 'PAST_DUE', pastDueSince: new Date() },
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
      }
    }

    this.logger.warn(`Pagamento falhou: empresa ${company.id} → PAST_DUE`);
  }

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

  // ─── Recover ──────────────────────────────────────────────────────────────

  async recover(email: string, companyId: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), companyId, isActive: true },
      select: {
        id: true, name: true, email: true, role: true, passwordHash: true,
        company: {
          select: {
            id: true, name: true, email: true,
            subscriptionStatus: true, trialEndsAt: true,
            currentPeriodEnd: true, stripeCustomerId: true, plan: true,
          },
        },
      },
    });

    const dummyHash = await bcrypt.hash('recover-timing-protection', 10);
    const isValid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
    if (!user || !isValid) throw new UnauthorizedException('Credenciais inválidas');

    const company = user.company;
    const now = new Date();
    const trialDaysLeft = company.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(company.trialEndsAt).getTime() - now.getTime()) / 86_400_000))
      : null;

    let billingPortalUrl: string | null = null;
    if (this.stripe && company.stripeCustomerId) {
      try {
        const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
        const session = await this.stripe.billingPortal.sessions.create({
          customer: company.stripeCustomerId,
          return_url: `${frontendUrl}/dashboard`,
        });
        billingPortalUrl = session.url;
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

  async getSubscriptionStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true, stripeCustomerId: true },
    });
    if (!company) return null;

    const now = new Date();
    const daysLeft = company.trialEndsAt
      ? Math.max(0, Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    return { ...company, trialDaysLeft: daysLeft };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getPriceId(plan: string): string {
    const prices: Record<string, string> = {
      STARTER:      this.config.get<string>('STRIPE_PRICE_STARTER', ''),
      PROFESSIONAL: this.config.get<string>('STRIPE_PRICE_PROFESSIONAL', ''),
      ENTERPRISE:   this.config.get<string>('STRIPE_PRICE_ENTERPRISE', ''),
    };
    const priceId = prices[plan];
    if (!priceId) throw new BadRequestException(`Price ID não configurado para o plano: ${plan}`);
    return priceId;
  }

  private extractPlan(obj: Record<string, unknown>): string {
    const meta = obj['metadata'] as Record<string, string> | undefined;
    return meta?.['plan'] ?? 'STARTER';
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
}
