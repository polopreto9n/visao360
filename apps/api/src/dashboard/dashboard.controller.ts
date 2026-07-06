import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DashboardPeriodDto } from './dto/dashboard-period.dto';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPIs gerenciais com filtro global de período' })
  kpis(@CurrentUser() u: AuthenticatedUser, @Query() q: DashboardPeriodDto) {
    return this.svc.getKPIs(u.companyId, u.id, u.role, q);
  }

  @Get('unit-ranking')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Ranking operacional dos condomínios no período' })
  unitRanking(@CurrentUser() u: AuthenticatedUser, @Query() q: DashboardPeriodDto) {
    return this.svc.getUnitRanking(u.companyId, q, u.id, u.role);
  }

  @Get('my-actions')
  @ApiOperation({ summary: 'Próximas ações do usuário logado no período (checklists + OS urgentes)' })
  myActions(@CurrentUser() u: AuthenticatedUser, @Query() q: DashboardPeriodDto) {
    return this.svc.getMyActions(u.id, u.companyId, u.role, q);
  }

  @Get('operational-metrics')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Métricas operacionais avançadas: MTTR, aging de OS, aderência ao plano' })
  operationalMetrics(@CurrentUser() u: AuthenticatedUser, @Query() q: DashboardPeriodDto) {
    return this.svc.getOperationalMetrics(u.companyId, q);
  }
}
