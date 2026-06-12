import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecutionStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { StartExecutionDto } from './dto/start-execution.dto';
import { SubmitExecutionDto } from './dto/submit-execution.dto';
import { ChecklistSchedulesService } from '../checklist-schedules/checklist-schedules.service';
import { UnitsService } from '../units/units.service';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ChecklistSchedulesService,
    private readonly units: UnitsService,
  ) {}

  private isScopedRole(userRole?: string) {
    return userRole === Role.TECNICO || userRole === Role.CLIENTE;
  }

  private async getScopedUnitIds(userId?: string, userRole?: string) {
    if (!this.isScopedRole(userRole) || !userId) return undefined;
    return this.units.getUserUnitIds(userId);
  }

  async start(companyId: string, userId: string, dto: StartExecutionDto, userRole?: string) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: dto.checklistId, companyId, isActive: true },
      include: { items: { select: { id: true } } },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');
    if (checklist.items.length === 0) {
      throw new BadRequestException('Checklist não possui itens cadastrados');
    }

    let asset: { id: string; unitId: string } | null = null;
    if (dto.assetId) {
      asset = await this.prisma.asset.findFirst({
        where: { id: dto.assetId, companyId },
        select: { id: true, unitId: true },
      });
      if (!asset) throw new NotFoundException('Equipamento nao encontrado');
    }

    if (checklist.assetId && dto.assetId && checklist.assetId !== dto.assetId) {
      throw new BadRequestException('Checklist nao pertence ao equipamento informado');
    }
    if (checklist.assetId && !dto.assetId) {
      throw new BadRequestException('Este checklist exige um equipamento vinculado');
    }
    if (checklist.unitId && asset && checklist.unitId !== asset.unitId) {
      throw new BadRequestException('Equipamento nao pertence a unidade do checklist');
    }

    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (userRole === Role.CLIENTE) {
        throw new ForbiddenException('Clientes nao podem iniciar execucoes de checklist');
      }
      const unitId = asset?.unitId ?? checklist.unitId;
      if (!unitId || !scopedUnitIds.includes(unitId)) {
        throw new ForbiddenException('Checklist nao pertence a uma unidade atribuida a voce');
      }
    }

    return this.prisma.execution.create({
      data: {
        companyId, userId,
        checklistId: dto.checklistId,
        assetId: dto.assetId,
        status: ExecutionStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
      include: {
        checklist: { include: { items: { orderBy: { order: 'asc' } } } },
        asset: { select: { id: true, name: true, qrCode: true } },
      },
    });
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { userId?: string; checklistId?: string; assetId?: string; status?: ExecutionStatus },
    userId?: string,
    userRole?: string,
  ) {
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (scopedUnitIds.length === 0) return paginated([], 0, dto);
      if (userRole === Role.TECNICO && dto.userId && dto.userId !== userId) {
        throw new ForbiddenException('Tecnicos so podem listar as proprias execucoes');
      }
    }

    const where = {
      companyId,
      ...(scopedUnitIds && userRole === Role.TECNICO ? { userId } : dto.userId ? { userId: dto.userId } : {}),
      ...(dto.checklistId ? { checklistId: dto.checklistId } : {}),
      ...(dto.assetId ? { assetId: dto.assetId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(scopedUnitIds && userRole === Role.CLIENTE
        ? {
            OR: [
              { asset: { unitId: { in: scopedUnitIds } } },
              { checklist: { unitId: { in: scopedUnitIds } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.execution.findMany({
        where,
        include: {
          checklist: { select: { id: true, name: true, type: true } },
          user: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.execution.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id, companyId },
      include: {
        checklist: { include: { items: { orderBy: { order: 'asc' } } } },
        items: { include: { checklistItem: true } },
        user: { select: { id: true, name: true, email: true } },
        asset: { select: { id: true, name: true, qrCode: true, unitId: true } },
      },
    });
    if (!execution) throw new NotFoundException('Execução não encontrada');
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (userRole === Role.TECNICO && execution.userId !== userId) {
        throw new ForbiddenException('Voce nao pode acessar execucoes de outro tecnico');
      }
      if (userRole === Role.CLIENTE) {
        const unitId = execution.asset?.unitId ?? execution.checklist.unitId;
        if (!unitId || !scopedUnitIds.includes(unitId)) {
          throw new ForbiddenException('Execucao nao pertence a uma unidade atribuida a voce');
        }
      }
    }
    return execution;
  }

  /**
   * Conclui uma execução atomicamente via $transaction.
   * Garante consistência: se qualquer etapa falhar, nenhuma mudança é salva.
   */
  async complete(id: string, companyId: string, userId: string, dto: SubmitExecutionDto) {
    const execution = await this.findOne(id, companyId);

    if (execution.status === ExecutionStatus.COMPLETED) {
      throw new BadRequestException('Execução já foi concluída');
    }
    if (execution.status === ExecutionStatus.CANCELLED) {
      throw new BadRequestException('Execução cancelada não pode ser concluída');
    }
    if (execution.userId !== userId) {
      throw new ForbiddenException('Você não pode concluir execuções de outro técnico');
    }

    const submittedIds = dto.items.map((i) => i.checklistItemId);
    if (new Set(submittedIds).size !== submittedIds.length) {
      throw new BadRequestException('Ha itens duplicados na execucao');
    }

    // Busca a definicao completa do checklist para impedir itens externos e respostas incompletas.
    const checklistItems = await this.prisma.checklistItem.findMany({
      where: { checklistId: execution.checklistId },
      select: {
        id: true,
        expectedAnswer: true,
        requiresPhoto: true,
        requiresNote: true,
      },
    });
    const checklistItemIds = new Set(checklistItems.map((ci) => ci.id));
    const unexpectedIds = submittedIds.filter((itemId) => !checklistItemIds.has(itemId));
    if (unexpectedIds.length > 0) {
      throw new BadRequestException('A execucao contem itens que nao pertencem ao checklist');
    }
    const missingIds = checklistItems.map((ci) => ci.id).filter((itemId) => !submittedIds.includes(itemId));
    if (missingIds.length > 0) {
      throw new BadRequestException('Todos os itens do checklist devem ser respondidos');
    }

    const answerMap = new Map(dto.items.map((item) => [item.checklistItemId, item]));
    for (const itemDef of checklistItems) {
      const answer = answerMap.get(itemDef.id);
      if (itemDef.requiresPhoto && !answer?.photoUrl?.trim()) {
        throw new BadRequestException('Ha itens obrigatorios sem foto');
      }
      if (itemDef.requiresNote && !answer?.notes?.trim()) {
        throw new BadRequestException('Ha itens obrigatorios sem observacao');
      }
    }

    const expectedMap = Object.fromEntries(checklistItems.map((ci) => [ci.id, ci.expectedAnswer]));
    const conformCount = dto.items.filter(
      (i) => i.answer === (expectedMap[i.checklistItemId] ?? true),
    ).length;
    const score = dto.items.length > 0
      ? Math.round((conformCount / dto.items.length) * 10000) / 100
      : 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        dto.items.map((item) =>
          tx.executionItem.upsert({
            where: {
              executionId_checklistItemId: {
                executionId: id,
                checklistItemId: item.checklistItemId,
              },
            },
            create: {
              executionId: id,
              checklistItemId: item.checklistItemId,
              answer: item.answer,
              notes: item.notes,
              photoUrl: item.photoUrl,
            },
            update: {
              answer: item.answer,
              notes: item.notes,
              photoUrl: item.photoUrl,
            },
          }),
        ),
      );

      return tx.execution.update({
        where: { id },
        data: {
          status: ExecutionStatus.COMPLETED,
          completedAt: new Date(),
          notes: dto.notes,
          signatureUrl: dto.signatureUrl,
          score,
        },
        include: {
          items: { include: { checklistItem: true } },
          checklist: { select: { id: true, name: true } },
        },
      });
    });

    // Avança agenda fora da transação — falha aqui não reverte a execução concluída
    this.schedules
      .advanceAfterExecution(execution.checklistId, execution.assetId ?? null, companyId)
      .catch((err) =>
        console.error(`[ExecutionsService] Falha ao avançar agenda (execução ${id}):`, err),
      );

    // Auto-cria OS para itens reprovados quando conformidade < 70%
    const checklistUnitId = (execution.checklist as { unitId?: string | null }).unitId;
    if (score < 70 && dto.items.length > 0) {
      this.autoCreateWorkOrder(execution, companyId, userId, dto.items, expectedMap, score, checklistUnitId ?? null)
        .catch((err) =>
          console.error(`[ExecutionsService] Falha ao criar OS automática (execução ${id}):`, err),
        );
    }

    return updated;
  }

  private async autoCreateWorkOrder(
    execution: Awaited<ReturnType<ExecutionsService['findOne']>>,
    companyId: string,
    userId: string,
    items: SubmitExecutionDto['items'],
    expectedMap: Record<string, boolean>,
    score: number,
    checklistUnitId: string | null,
  ) {
    const failedIds = items
      .filter((i) => i.answer !== (expectedMap[i.checklistItemId] ?? true))
      .map((i) => i.checklistItemId);

    if (failedIds.length === 0) return;

    // Resolve unitId: prefere do checklist, fallback para unidade do asset
    let unitId = checklistUnitId;
    if (!unitId && execution.assetId) {
      const asset = await this.prisma.asset.findUnique({
        where: { id: execution.assetId },
        select: { unitId: true },
      });
      unitId = asset?.unitId ?? null;
    }

    if (!unitId) return; // não tem unidade → não cria OS

    const failedDetails = await this.prisma.checklistItem.findMany({
      where: { id: { in: failedIds } },
      select: { question: true, order: true },
      orderBy: { order: 'asc' },
    });

    const priority = score < 50 ? 'HIGH' : 'MEDIUM';
    const code = `OS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const itemList = failedDetails.map((i) => `• ${i.question}`).join('\n');

    await this.prisma.workOrder.create({
      data: {
        companyId,
        creatorId: userId,
        code,
        title: `Correção — ${execution.checklist.name}`,
        description: `Gerada automaticamente após checklist com ${score.toFixed(0)}% de conformidade.\n\nItens reprovados:\n${itemList}`,
        status: 'OPEN',
        priority,
        unitId,
        assetId: execution.assetId ?? null,
      },
    });
  }

  async deleteExecution(id: string, companyId: string) {
    const execution = await this.findOne(id, companyId);
    await this.prisma.executionItem.deleteMany({ where: { executionId: execution.id } });
    await this.prisma.execution.delete({ where: { id: execution.id } });
    return { deleted: true };
  }

  async cancel(id: string, companyId: string, userId: string) {
    const execution = await this.findOne(id, companyId);

    if (execution.status === ExecutionStatus.COMPLETED) {
      throw new BadRequestException('Execução concluída não pode ser cancelada');
    }
    if (execution.userId !== userId) {
      throw new ForbiddenException('Você não pode cancelar execuções de outro técnico');
    }

    return this.prisma.execution.update({
      where: { id },
      data: { status: ExecutionStatus.CANCELLED },
    });
  }
}
