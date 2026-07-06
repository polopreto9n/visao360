import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { IsOptional, IsString } from 'class-validator';

class AddCommentDto {
  @IsString()
  body!: string;
}

class AssignDto {
  @IsOptional()
  @IsString()
  assigneeId!: string | null;
}

class ConvertToWoDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsString()
  priority!: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;
}

@ApiTags('Incidents')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly svc: IncidentsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar novo incidente/ocorrencia' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateIncidentDto) {
    return this.svc.create(u.companyId, u.id, dto, u.role);
  }

  @Get()
  @ApiOperation({ summary: 'Listar incidentes (filtros: status, severity, unitId)' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListIncidentsDto) {
    return this.svc.findAll(u.companyId, q, u.id, u.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter incidente por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId, u.id, u.role);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do incidente' })
  updateStatus(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateIncidentStatusDto) {
    return this.svc.updateStatus(id, u.companyId, dto, u.id, u.role);
  }

  @Patch(':id/assign')
  @Roles('OWNER', 'ADMIN', 'GESTOR')
  @ApiOperation({ summary: 'Atribuir responsável à ocorrência' })
  assign(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: AssignDto) {
    return this.svc.assign(id, u.companyId, dto.assigneeId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Adicionar comentário à ocorrência' })
  addComment(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: AddCommentDto) {
    return this.svc.addComment(id, u.companyId, u.id, dto.body);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'Excluir comentário da ocorrência' })
  deleteComment(@Param('id') id: string, @Param('commentId') commentId: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.deleteComment(id, commentId, u.companyId, u.id, u.role);
  }

  @Post(':id/convert-to-wo')
  @Roles('OWNER', 'ADMIN', 'GESTOR')
  @ApiOperation({ summary: 'Converter ocorrência em Ordem de Serviço' })
  convertToWorkOrder(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: ConvertToWoDto) {
    return this.svc.convertToWorkOrder(id, u.companyId, u.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover ocorrência (ADMIN/OWNER)' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId, u.role);
  }
}
