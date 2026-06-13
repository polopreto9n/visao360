import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { MonthlyReportDto } from './dto/monthly-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Reports')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('monthly')
  @ApiOperation({ summary: 'Relatório mensal em PDF de um condomínio (para assembleia)' })
  @ApiProduces('application/pdf')
  async monthly(
    @CurrentUser() u: AuthenticatedUser,
    @Query() dto: MonthlyReportDto,
    @Res() res: Response,
  ) {
    return this.svc.streamMonthlyReport(u.companyId, dto, res, u.id, u.role);
  }
}
