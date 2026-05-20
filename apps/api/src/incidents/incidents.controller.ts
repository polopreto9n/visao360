import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Incidents')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly svc: IncidentsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar novo incidente/ocorrencia' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateIncidentDto) {
    return this.svc.create(u.companyId, u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar incidentes (filtros: status, severity, unitId)' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListIncidentsDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter incidente por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do incidente' })
  updateStatus(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateIncidentStatusDto) {
    return this.svc.updateStatus(id, u.companyId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover ocorrência (ADMIN/OWNER)' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId, u.role);
  }
}
