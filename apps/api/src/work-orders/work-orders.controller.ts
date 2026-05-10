import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ListWorkOrdersDto } from './dto/list-work-orders.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('WorkOrders')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly svc: WorkOrdersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Criar ordem de serviço' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateWorkOrderDto) {
    return this.svc.create(u.companyId, u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar OSs com filtros (status, unidade, técnico, prioridade)' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListWorkOrdersDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('my')
  @ApiOperation({ summary: 'Minhas OSs abertas (técnico logado)' })
  myOrders(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.findMyOrders(u.companyId, u.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter OS por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status da OS (respeita máquina de estados)' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.svc.updateStatus(id, u.companyId, u.id, u.role as Role, dto);
  }

  @Patch(':id/assign/:assigneeId')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir técnico a uma OS' })
  assign(
    @Param('id') id: string,
    @Param('assigneeId') assigneeId: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.svc.assign(id, u.companyId, assigneeId);
  }
}
