import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExecutionsService } from './executions.service';
import { StartExecutionDto } from './dto/start-execution.dto';
import { SubmitExecutionDto } from './dto/submit-execution.dto';
import { ListExecutionsDto } from './dto/list-executions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Executions')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executions')
export class ExecutionsController {
  constructor(private readonly svc: ExecutionsService) {}

  @Post()
  @ApiOperation({ summary: 'Iniciar execucao de um checklist' })
  start(@CurrentUser() u: AuthenticatedUser, @Body() dto: StartExecutionDto) {
    return this.svc.start(u.companyId, u.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar execucoes (filtros: status, checklistId, userId)' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListExecutionsDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter execucao com todos os itens respondidos' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Concluir execucao com todas as respostas e assinatura' })
  complete(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: SubmitExecutionDto) {
    return this.svc.complete(id, u.companyId, u.id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar execucao em andamento' })
  cancel(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.cancel(id, u.companyId, u.id);
  }
}
