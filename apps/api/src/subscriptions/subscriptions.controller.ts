import {
  Body,
  Controller,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RecoverDto } from './dto/recover.dto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  /**
   * Endpoint público que recebe eventos do Stripe.
   * IMPORTANTE: o body deve chegar RAW (Buffer) para validação da assinatura.
   * Configure no main.ts: app.use('/api/v1/subscriptions/webhook', express.raw({ type: 'application/json' }))
   */
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

  /** Retorna status da assinatura do tenant autenticado */
  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Status da assinatura do tenant' })
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getSubscriptionStatus(user.companyId);
  }

  /**
   * Endpoint de recuperação para tenants SUSPENDED/CANCELLED.
   * Não requer JWT — valida credenciais diretamente e retorna status + link do Stripe Portal.
   * Único endpoint que um tenant bloqueado pode chamar sem token válido.
   */
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
