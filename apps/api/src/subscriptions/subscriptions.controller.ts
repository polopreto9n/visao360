import {
  Body, Controller, Post, Headers, RawBodyRequest, Req,
  HttpCode, HttpStatus, Get, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RecoverDto } from './dto/recover.dto';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook — não chamar manualmente' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from('');
    const event = await this.svc.parseAndVerifyWebhook(rawBody, sig ?? '');
    await this.svc.handleWebhookEvent(event.id, event.type, event.data as Record<string, unknown>);
    return { received: true };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Status da assinatura do tenant' })
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getSubscriptionStatus(user.companyId);
  }

  /**
   * Cria uma Stripe Checkout Session e retorna a URL para redirecionar o usuário.
   * Apenas OWNER ou ADMIN podem iniciar checkout.
   */
  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Cria sessão de checkout Stripe para upgrade de plano' })
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.createCheckoutSession(user.companyId, dto.plan);
  }

  /**
   * Gera URL do Stripe Customer Portal para o usuário gerenciar cartão, faturas e cancelamento.
   * Requer que a empresa já tenha um stripeCustomerId (assinatura ativa).
   */
  @Get('billing-portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Gera URL do Stripe Customer Portal (gerenciar pagamento)' })
  billingPortal(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.createBillingPortalSession(user.companyId);
  }

  @Post('recover')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Recuperação de acesso — retorna status e link de billing para tenants suspensos',
    description: 'Não requer JWT. Valida email + companyId + senha diretamente.',
  })
  recover(@Body() dto: RecoverDto) {
    return this.svc.recover(dto.email, dto.companyId, dto.password);
  }
}
