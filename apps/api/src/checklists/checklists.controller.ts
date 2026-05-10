import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { ListChecklistsDto } from './dto/list-checklists.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Checklists')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly svc: ChecklistsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Criar template de checklist com itens' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateChecklistDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar checklists ativos (filtros: type, unitId, assetId)' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListChecklistsDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter checklist por ID com itens' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar metadados do checklist (sem itens)' })
  update(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateChecklistDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizacao completa: metadados + substitui todos os itens' })
  fullUpdate(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: CreateChecklistDto) {
    return this.svc.fullUpdate(id, u.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desativar checklist (ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.deleteChecklist(id, u.companyId);
  }
}
