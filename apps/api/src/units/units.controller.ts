import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Units')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Criar unidade' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar unidades' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: PaginationDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter unidade por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar unidade' })
  update(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateUnitDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desativar unidade (ADMIN)' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId);
  }
}
