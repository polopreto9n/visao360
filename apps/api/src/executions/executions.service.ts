import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { StartExecutionDto } from './dto/start-execution.dto';
import { SubmitExecutionDto } from './dto/submit-execution.dto';
import { ChecklistSchedulesService } from '../checklist-schedules/checklist-schedules.service';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: ChecklistSchedulesService,
  ) {}

  async start(companyId: string, userId: string, dto: StartExecutionDto) {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: dto.checklistId, companyId, isActive: true },
      include: { items: { select: { id: true } } },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');
    if (checklist.items.length === 0) {
      throw new BadRequestException('Checklist não possui itens cadastrados');
    }

    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, companyId } });
      if (!asset) throw new NotFoundException('Equipamento não encontrado');
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
    dto: PaginationDto & { userId?: string; checklistId?: string; status?: ExecutionStatus },
  ) {
    const where = {
      companyId,
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.checklistId ? { checklistId: dto.checklistId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
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

  async findOne(id: string, companyId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id, companyId },
      include: {
        checklist: { include: { items: { orderBy: { order: 'asc' } } } },
        items: { include: { checklistItem: true } },
        user: { select: { id: true, name: true, email: true } },
        asset: { select: { id: true, name: true, qrCode: true } },
      },
    });
    if (!execution) throw new NotFoundException('Execução não encontrada');
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

    // Busca expectedAnswer de cada item em lote (evita N+1)
    const checklistItems = await this.prisma.checklistItem.findMany({
      where: { id: { in: dto.items.map((i) => i.checklistItemId) } },
      select: { id: true, expectedAnswer: true },
    });
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

    return updated;
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
