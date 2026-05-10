import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Companies')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados da empresa atual' })
  me(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(u.companyId);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Estatísticas da empresa' })
  stats(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.getStats(u.companyId);
  }

  @Patch('me')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualizar dados da empresa (ADMIN)' })
  update(@CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateCompanyDto) {
    return this.svc.update(u.companyId, dto);
  }
}
