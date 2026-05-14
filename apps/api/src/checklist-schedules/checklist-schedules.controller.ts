import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ChecklistSchedulesService } from './checklist-schedules.service';
import { CreateChecklistScheduleDto } from './dto/create-checklist-schedule.dto';
import { UpdateChecklistScheduleDto } from './dto/update-checklist-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Checklist Schedules')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('checklist-schedules')
export class ChecklistSchedulesController {
  constructor(private readonly svc: ChecklistSchedulesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Criar agenda de checklist' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateChecklistScheduleDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Listar todas as agendas da empresa' })
  findAll(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.findAll(u.companyId);
  }

  @Get('by-checklist/:checklistId')
  @ApiOperation({ summary: 'Agenda ativa de um checklist específico' })
  findByChecklist(@Param('checklistId') checklistId: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findByChecklist(checklistId, u.companyId);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Agendas atribuídas ao técnico logado (próximos 30 dias)' })
  findMine(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.findMine(u.companyId, u.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter agenda por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar agenda' })
  update(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateChecklistScheduleDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Desativar agenda' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId);
  }
}
