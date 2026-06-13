import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Suppliers')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Criar fornecedor' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar fornecedores' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: PaginationDto) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('options')
  @ApiOperation({ summary: 'Listar opções de fornecedores para vínculo em OS' })
  findOptions(@CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOptions(u.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter fornecedor por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar fornecedor' })
  update(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateSupplierDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Desativar fornecedor' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId);
  }
}
