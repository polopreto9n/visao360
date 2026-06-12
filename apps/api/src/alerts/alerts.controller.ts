import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { ListAlertsDto } from './dto/list-alerts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Alertas')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Central inteligente de alertas operacionais' })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAlertsDto) {
    return this.svc.findAll(user.companyId, user.id, user.role, query);
  }

  @Patch(':fingerprint/read')
  @ApiOperation({ summary: 'Marcar um alerta operacional como lido' })
  markAsRead(
    @Param('fingerprint') fingerprint: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.markAsRead(fingerprint, user.id, user.companyId);
  }
}
