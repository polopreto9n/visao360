import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Dashboard')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('kpis')
  @ApiOperation({
    summary: 'KPIs gerenciais em tempo real',
    description: 'Retorna: assets por status, OSs abertas/vencidas, taxa de checklists, incidentes, atividade recente e alertas de manutenção',
  })
  kpis(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.getKPIs(u.companyId, u.id, u.role);
  }
}
