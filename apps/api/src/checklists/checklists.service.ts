import { Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateChecklistDto) {
    const { items, ...data } = dto;
    return this.prisma.checklist.create({
      data: {
        ...data, companyId,
        items: {
          create: items.map((item) => ({
            order: item.order,
            question: item.question,
            description: item.description,
            requiresPhoto: item.requiresPhoto ?? false,
            requiresNote: item.requiresNote ?? false,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async findAll(companyId: string, dto: PaginationDto & { type?: ChecklistType; unitId?: string }) {
    const where = {
      companyId, isActive: true,
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : {}),
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

  async findOne(id: string, companyId: string) {
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
    return checklist;
  }

  async update(id: string, companyId: string, dto: UpdateChecklistDto) {
    await this.findOne(id, companyId);
    return this.prisma.checklist.update({
      where: { id }, data: dto,
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

    // 1. Atualiza metadados do checklist
    await this.prisma.checklist.update({ where: { id }, data: meta });

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
    await this.prisma.checklist.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  }
}
