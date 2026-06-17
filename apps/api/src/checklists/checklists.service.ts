import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UnitsService } from '../units/units.service';

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  private async validateScope(companyId: string, unitId?: string | null, assetId?: string | null) {
    let resolvedUnitId = unitId ?? null;

    if (unitId) {
      const unit = await this.prisma.unit.findFirst({ where: { id: unitId, companyId } });
      if (!unit) throw new NotFoundException('Unidade nao encontrada');
    }

    if (assetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: assetId, companyId },
        select: { unitId: true },
      });
      if (!asset) throw new NotFoundException('Equipamento nao encontrado');
      if (unitId && asset.unitId !== unitId) {
        throw new ForbiddenException('Equipamento nao pertence a unidade informada');
      }
      resolvedUnitId = resolvedUnitId ?? asset.unitId;
    }

    return resolvedUnitId;
  }

  async create(companyId: string, dto: CreateChecklistDto) {
    const { items, ...data } = dto;
    const unitId = await this.validateScope(companyId, data.unitId, data.assetId);
    return this.prisma.checklist.create({
      data: {
        ...data, companyId, unitId,
        items: {
          create: items.map((item) => ({
            order: item.order,
            question: item.question,
            description: item.description,
            requiresPhoto: item.requiresPhoto ?? false,
            requiresNote: item.requiresNote ?? false,
            expectedAnswer: item.expectedAnswer ?? true,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { type?: ChecklistType; unitId?: string; assetId?: string },
    userId?: string,
    userRole?: string,
  ) {
    let unitIds: string[] | undefined;
    let allowedChecklistIds: string[] | undefined; // undefined = sem restrição (admin/owner)

    if (userRole === 'TECNICO' && userId) {
      // TECNICO: vê APENAS checklists com agenda ativa atribuída a ele
      const scheduledForMe = await this.prisma.checklistSchedule.findMany({
        where: {
          companyId,
          isActive: true,
          assigneeId: userId,
          checklist: { isActive: true },
        },
        select: { checklistId: true },
      });
      allowedChecklistIds = [...new Set(scheduledForMe.map((s) => s.checklistId))];
      // Se não tem nenhum agendado → retorna lista vazia imediatamente
      if (allowedChecklistIds.length === 0) {
        return paginated([], 0, dto);
      }
    } else if (userRole === 'GESTOR' && userId) {
      // GESTOR com unidades atribuídas vê apenas as suas; sem atribuição vê todas da empresa
      const ids = await this.units.getUserUnitIds(userId);
      if (ids.length > 0) unitIds = ids;
      // ids.length === 0 → unitIds permanece undefined → sem filtro de unidade
    }

    const where = {
      companyId, isActive: true,
      ...(dto.type ? { type: dto.type } : {}),
      ...(allowedChecklistIds
        ? { id: { in: allowedChecklistIds } }
        : dto.assetId ? { assetId: dto.assetId } : dto.unitId ? { unitId: dto.unitId } : unitIds ? { unitId: { in: unitIds } } : {}),
      ...(dto.search ? { name: { contains: dto.search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.checklist.findMany({
        where,
        include: {
          items: { orderBy: { order: 'asc' } },
          unit: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, category: true } },
        },
        orderBy: { name: 'asc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.checklist.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id, companyId },
      include: {
        items: { orderBy: { order: 'asc' } },
        unit: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');
    if (userRole === 'TECNICO' && userId && checklist.unitId) {
      const unitIds = await this.units.getUserUnitIds(userId);
      if (!unitIds.includes(checklist.unitId)) {
        throw new ForbiddenException('Checklist não pertence a uma unidade atribuída a você');
      }
    }
    return checklist;
  }

  async update(id: string, companyId: string, dto: UpdateChecklistDto) {
    await this.findOne(id, companyId);
    const unitId = dto.unitId || dto.assetId
      ? await this.validateScope(companyId, dto.unitId, dto.assetId)
      : undefined;
    return this.prisma.checklist.update({
      where: { id }, data: { ...dto, ...(unitId ? { unitId } : {}) },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * Atualização completa: metadados + sincroniza itens preservando IDs existentes.
   * Estratégia: update in-place para preservar referências em ExecutionItem (histórico).
   * - Itens que existem → UPDATE (mantém ID, preserva histórico)
   * - Itens novos → CREATE
   * - Itens removidos → cascade delete (remove execution_items primeiro)
   */
  async fullUpdate(id: string, companyId: string, dto: CreateChecklistDto) {
    await this.findOne(id, companyId);
    const { items: newItems, ...meta } = dto;
    const unitId = await this.validateScope(companyId, meta.unitId, meta.assetId);

    // 1. Atualiza metadados do checklist
    await this.prisma.checklist.update({ where: { id }, data: { ...meta, unitId } });

    // 2. Busca itens existentes em ordem
    const existing = await this.prisma.checklistItem.findMany({
      where: { checklistId: id },
      orderBy: { order: 'asc' },
    });

    // 3. Sincroniza item a item
    for (let i = 0; i < Math.max(newItems.length, existing.length); i++) {
      const hasNew = i < newItems.length;
      const hasOld = i < existing.length;

      if (hasNew && hasOld) {
        // Atualiza item existente preservando o mesmo ID
        await this.prisma.checklistItem.update({
          where: { id: existing[i].id },
          data: {
            order: i + 1,
            question: newItems[i].question,
            description: newItems[i].description ?? null,
            requiresPhoto: newItems[i].requiresPhoto ?? false,
            requiresNote: newItems[i].requiresNote ?? false,
            expectedAnswer: newItems[i].expectedAnswer ?? true,
          },
        });
      } else if (hasNew && !hasOld) {
        // Cria novo item
        await this.prisma.checklistItem.create({
          data: {
            checklistId: id,
            order: i + 1,
            question: newItems[i].question,
            description: newItems[i].description ?? null,
            requiresPhoto: newItems[i].requiresPhoto ?? false,
            requiresNote: newItems[i].requiresNote ?? false,
            expectedAnswer: newItems[i].expectedAnswer ?? true,
          },
        });
      } else if (!hasNew && hasOld) {
        // Remove item extra (cascade: remove execution_items primeiro)
        await this.prisma.executionItem.deleteMany({
          where: { checklistItemId: existing[i].id },
        });
        await this.prisma.checklistItem.delete({ where: { id: existing[i].id } });
      }
    }

    return this.findOne(id, companyId);
  }

  async deleteChecklist(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.$transaction([
      this.prisma.checklist.update({ where: { id }, data: { isActive: false } }),
      this.prisma.checklistSchedule.updateMany({ where: { checklistId: id }, data: { isActive: false } }),
    ]);
    return { deleted: true };
  }
}
