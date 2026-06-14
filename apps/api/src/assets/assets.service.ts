import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';
import { AssetStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { paginated } from '../common/dto/pagination.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

const ASSET_SELECT = {
  id: true, name: true, code: true, category: true, brand: true, model: true,
  serialNumber: true, qrCode: true, status: true, installDate: true,
  lastMaintenanceAt: true, nextMaintenanceAt: true, warrantyUntil: true, contractUntil: true,
  description: true, photoUrl: true,
  createdAt: true, updatedAt: true,
  unit: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  private isScopedRole(userRole?: string) {
    return userRole === Role.TECNICO || userRole === Role.CLIENTE;
  }

  private async getScopedUnitIds(userId?: string, userRole?: string) {
    if (!this.isScopedRole(userRole) || !userId) return undefined;
    return this.units.getUserUnitIds(userId);
  }

  async create(companyId: string, dto: CreateAssetDto) {
    // Verificar que a unidade pertence à empresa
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada nesta empresa');

    return this.prisma.asset.create({
      data: { ...dto, companyId },
      select: ASSET_SELECT,
    });
  }

  async findAll(companyId: string, dto: ListAssetsDto, userId?: string, userRole?: string) {
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (scopedUnitIds.length === 0) return paginated([], 0, dto);
      if (dto.unitId && !scopedUnitIds.includes(dto.unitId)) return paginated([], 0, dto);
    }

    const where = {
      companyId,
      ...(dto.unitId ? { unitId: dto.unitId } : scopedUnitIds ? { unitId: { in: scopedUnitIds } } : {}),
      ...(dto.category ? { category: { contains: dto.category, mode: 'insensitive' as const } } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { code: { contains: dto.search, mode: 'insensitive' as const } },
                 { brand: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({
        where, select: ASSET_SELECT,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId },
      include: {
        unit: { select: { id: true, name: true, address: true } },
        checklists: { where: { isActive: true }, select: { id: true, name: true, type: true } },
        workOrders: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: { id: true, code: true, title: true, status: true, priority: true },
          take: 5,
        },
      },
    });
    if (!asset) throw new NotFoundException('Equipamento não encontrado');
    if ((userRole === 'TECNICO' || userRole === 'CLIENTE') && userId) {
      const unitIds = await this.units.getUserUnitIds(userId);
      if (!unitIds.includes(asset.unit.id)) {
        throw new ForbiddenException('Equipamento não pertence a uma unidade atribuída a você');
      }
    }
    return asset;
  }

  private async assertAssetAccess(id: string, companyId: string, userId?: string, userRole?: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId },
      include: { unit: { select: { id: true, name: true, address: true } } },
    });
    if (!asset) throw new NotFoundException('Equipamento nao encontrado');

    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds && !scopedUnitIds.includes(asset.unitId)) {
      throw new ForbiddenException('Equipamento nao pertence a uma unidade atribuida a voce');
    }

    return asset;
  }

  async findByQRCode(qrCode: string, companyId: string, userId?: string, userRole?: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { qrCode, companyId },
      include: { unit: { select: { id: true, name: true } } },
    });
    if (!asset) throw new NotFoundException(`QR Code "${qrCode}" não encontrado`);
    if ((userRole === 'TECNICO' || userRole === 'CLIENTE') && userId) {
      const unitIds = await this.units.getUserUnitIds(userId);
      if (!unitIds.includes(asset.unit.id)) {
        throw new ForbiddenException('Este equipamento não pertence a uma unidade atribuída a você');
      }
    }
    return asset;
  }

  async update(id: string, companyId: string, dto: UpdateAssetDto) {
    await this.findOne(id, companyId);
    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
      if (!unit) throw new NotFoundException('Unidade não encontrada');
    }
    return this.prisma.asset.update({ where: { id }, data: dto, select: ASSET_SELECT });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: ASSET_SELECT,
    });
  }

  /** Gera imagem PNG do QR Code e envia diretamente na response */
  async streamQRCodeImage(id: string, companyId: string, res: Response, userId?: string, userRole?: string) {
    const asset = await this.findOne(id, companyId, userId, userRole);
    const qrData = `visao360://asset/${companyId}/${asset.id}?qr=${asset.qrCode}`;

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${asset.code ?? asset.id}-qr.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await QRCode.toFileStream(res as any, qrData, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' },
    });
  }

  async getChecklists(id: string, companyId: string, userId?: string, userRole?: string) {
    const asset = await this.assertAssetAccess(id, companyId, userId, userRole);

    const CHECKLIST_INCLUDE = {
      items: {
        select: { id: true, order: true, question: true, description: true, requiresPhoto: true, requiresNote: true },
        orderBy: { order: 'asc' as const },
      },
    };

    // 1. Checklists vinculados diretamente ao ativo
    const direct = await this.prisma.checklist.findMany({
      where: { assetId: id, companyId, isActive: true },
      include: CHECKLIST_INCLUDE,
      orderBy: { name: 'asc' },
    });
    if (direct.length > 0) return direct;

    // 2. Checklists da mesma unidade sem ativo específico
    const unitLevel = await this.prisma.checklist.findMany({
      where: { unitId: asset.unitId, assetId: null, companyId, isActive: true },
      include: CHECKLIST_INCLUDE,
      orderBy: { name: 'asc' },
    });
    if (unitLevel.length > 0) return unitLevel;

    // 3. Checklists gerais da empresa (sem unidade ou ativo)
    return this.prisma.checklist.findMany({
      where: { assetId: null, unitId: null, companyId, isActive: true },
      include: CHECKLIST_INCLUDE,
      orderBy: { name: 'asc' },
      take: 5,
    });
  }

  async getHistory(id: string, companyId: string, userId?: string, userRole?: string) {
    await this.assertAssetAccess(id, companyId, userId, userRole);

    const [executions, workOrders] = await Promise.all([
      this.prisma.execution.findMany({
        where: { assetId: id, companyId, status: 'COMPLETED' },
        select: {
          id: true, score: true, completedAt: true, notes: true,
          checklist: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
      }),
      this.prisma.workOrder.findMany({
        where: { assetId: id, companyId },
        select: {
          id: true, code: true, title: true, status: true, priority: true,
          createdAt: true, completedAt: true, cost: true, materialsUsed: true,
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totalCost = workOrders.reduce((sum, wo) => sum + (wo.cost ?? 0), 0);
    const itemHistory = await this.getItemHistory(executions);

    return { executions, workOrders, totalCost, itemHistory };
  }

  /** Histórico de respostas por item de checklist, para alimentar alertas de itens recorrentes */
  private async getItemHistory(
    executions: { id: string; completedAt: Date | null }[],
  ) {
    if (executions.length === 0) return [];

    const completedAtByExecution = new Map(executions.map((e) => [e.id, e.completedAt]));

    const items = await this.prisma.executionItem.findMany({
      where: { executionId: { in: executions.map((e) => e.id) } },
      select: {
        executionId: true,
        answer: true,
        checklistItem: {
          select: { id: true, checklistId: true, question: true, expectedAnswer: true },
        },
      },
    });

    const byChecklistItem = new Map<
      string,
      {
        checklistItemId: string;
        checklistId: string;
        question: string;
        expectedAnswer: boolean;
        results: { completedAt: Date | null; answer: boolean | null }[];
      }
    >();

    for (const item of items) {
      const ci = item.checklistItem;
      if (!byChecklistItem.has(ci.id)) {
        byChecklistItem.set(ci.id, {
          checklistItemId: ci.id,
          checklistId: ci.checklistId,
          question: ci.question,
          expectedAnswer: ci.expectedAnswer,
          results: [],
        });
      }
      byChecklistItem.get(ci.id)!.results.push({
        completedAt: completedAtByExecution.get(item.executionId) ?? null,
        answer: item.answer,
      });
    }

    for (const entry of byChecklistItem.values()) {
      entry.results.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    }

    return Array.from(byChecklistItem.values());
  }

  async getRecurringIssues(companyId: string, userId?: string, userRole?: string, months = 6) {
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds && scopedUnitIds.length === 0) return [];

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const groups = await this.prisma.workOrder.groupBy({
      by: ['assetId'],
      where: {
        companyId,
        assetId: { not: null },
        createdAt: { gte: since },
        ...(scopedUnitIds ? { unitId: { in: scopedUnitIds } } : {}),
      },
      _count: { _all: true },
      having: { assetId: { _count: { gte: 2 } } },
    });
    if (groups.length === 0) return [];

    const assetIds = groups.map((g) => g.assetId as string);
    const countByAsset = new Map(groups.map((g) => [g.assetId as string, g._count._all]));

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: assetIds }, companyId },
      select: {
        id: true, name: true, category: true, status: true,
        unit: { select: { id: true, name: true } },
        workOrders: {
          where: { companyId, createdAt: { gte: since } },
          select: { id: true, code: true, title: true, status: true, priority: true, createdAt: true, completedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return assets
      .map((asset) => ({ ...asset, issueCount: countByAsset.get(asset.id) ?? 0 }))
      .sort((a, b) => b.issueCount - a.issueCount);
  }

  async updateStatus(id: string, companyId: string, status: AssetStatus, userId?: string, userRole?: string) {
    if (userRole === Role.CLIENTE) {
      throw new ForbiddenException('Clientes não podem alterar status de equipamentos');
    }
    await this.assertAssetAccess(id, companyId, userId, userRole);
    return this.prisma.asset.update({
      where: { id },
      data: {
        status,
        ...(status === AssetStatus.MAINTENANCE ? { lastMaintenanceAt: new Date() } : {}),
      },
      select: ASSET_SELECT,
    });
  }

  /** Retorna URL de dados base64 do QR Code */
  async getQRCodeDataUrl(id: string, companyId: string, userId?: string, userRole?: string) {
    const asset = await this.findOne(id, companyId, userId, userRole);
    const qrData = `visao360://asset/${companyId}/${asset.id}?qr=${asset.qrCode}`;
    const dataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' },
    });
    return { qrCode: asset.qrCode, qrData, dataUrl };
  }
}
