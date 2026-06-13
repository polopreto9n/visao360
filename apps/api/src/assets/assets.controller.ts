import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Assets')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Cadastrar equipamento' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateAssetDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar equipamentos com filtros' })
  findAll(@CurrentUser() u: AuthenticatedUser, @Query() q: ListAssetsDto) {
    return this.svc.findAll(u.companyId, q, u.id, u.role);
  }

  @Get('recurring-issues')
  @ApiOperation({ summary: 'Equipamentos com problemas recorrentes (múltiplas OS nos últimos meses)' })
  getRecurringIssues(@CurrentUser() u: AuthenticatedUser, @Query('months') months?: string) {
    return this.svc.getRecurringIssues(u.companyId, u.id, u.role, months ? Number(months) : undefined);
  }

  @Get('qr/:qrCode')
  @ApiOperation({ summary: 'Buscar equipamento por QR Code (scanner mobile)' })
  findByQR(@Param('qrCode') qrCode: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findByQRCode(qrCode, u.companyId, u.id, u.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter equipamento por ID' })
  findOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.findOne(id, u.companyId, u.id, u.role);
  }

  @Get(':id/checklists')
  @ApiOperation({ summary: 'Checklists vinculados ao equipamento' })
  getChecklists(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.getChecklists(id, u.companyId, u.id, u.role);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Histórico de execuções e OS do equipamento' })
  getHistory(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.getHistory(id, u.companyId, u.id, u.role);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualizar status do equipamento' })
  updateStatus(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateAssetStatusDto) {
    return this.svc.updateStatus(id, u.companyId, dto.status, u.id, u.role);
  }

  @Get(':id/qr-image')
  @ApiOperation({ summary: 'Imagem PNG do QR Code do equipamento' })
  @ApiProduces('image/png')
  async qrImage(
    @Param('id') id: string,
    @CurrentUser() u: AuthenticatedUser,
    @Res() res: Response,
  ) {
    return this.svc.streamQRCodeImage(id, u.companyId, res, u.id, u.role);
  }

  @Get(':id/qr-data')
  @ApiOperation({ summary: 'QR Code em base64 para exibição no frontend' })
  qrData(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.getQRCodeDataUrl(id, u.companyId, u.id, u.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar equipamento' })
  update(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser, @Body() dto: UpdateAssetDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiOperation({ summary: 'Inativar equipamento' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.remove(id, u.companyId);
  }
}
