import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { CreateChecklistScheduleDto } from './dto/create-checklist-schedule.dto';
import { UpdateChecklistScheduleDto } from './dto/update-checklist-schedule.dto';

const SCHEDULE_INCLUDE = {
  checklist: { select: { id: true, name: true, type: true } },
  asset: { select: { id: true, name: true, code: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class ChecklistSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(companyId: string, dto: CreateChecklistScheduleDto) {
    const checklist = await this.prisma.checklist.findFirst({ where: { id: dto.checklistId, companyId } });
    if (!checklist) throw new NotFoundException('Checklist não encontrado');

    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, companyId } });
      if (!asset) throw new NotFoundException('Equipamento não encontrado');
    }

    if (dto.assigneeId) {
      const user = await this.prisma.user.findFirst({ where: { id: dto.assigneeId, companyId } });
      if (!user) throw new NotFoundException('Técnico não encontrado');
    }

    const schedule = await this.prisma.checklistSchedule.create({
      data: {
        companyId,
        checklistId: dto.checklistId,
        assetId: dto.assetId,
        assigneeId: dto.assigneeId,
        name: dto.name,
        nextDueAt: new Date(dto.nextDueAt),
        repeatDays: dto.repeatDays,
        reminderDaysBefore: dto.reminderDaysBefore,
        releaseBeforeDays: dto.releaseBeforeDays ?? 3,
        toleranceDays: dto.toleranceDays ?? 2,
      },
      include: SCHEDULE_INCLUDE,
    });

    if (dto.assigneeId) {
      await this.notifyAssignee(schedule, companyId, 'atribuído');
    }

    return schedule;
  }

  private async notifyAssignee(
    schedule: { id: string; checklist: { name: string }; asset: { name: string } | null; nextDueAt: Date; assignee: { id: string; name: string } | null },
    companyId: string,
    action: string,
  ) {
    if (!schedule.assignee) return;
    const assetInfo = schedule.asset ? ` — ${schedule.asset.name}` : '';
    const dueDate = new Date(schedule.nextDueAt).toLocaleDateString('pt-BR');
    const title = `📋 Checklist ${action}: ${schedule.checklist.name}`;
    const body = `${schedule.checklist.name}${assetInfo} · Previsto para ${dueDate}`;

    await Promise.all([
      this.push.sendToUser(schedule.assignee.id, companyId, { title, body, data: { scheduleId: schedule.id, screen: 'checklist' } }),
      this.notifications.create({
        companyId,
        userId: schedule.assignee.id,
        type: NotificationType.CHECKLIST_DUE,
        title,
        body,
        data: { scheduleId: schedule.id },
      }),
    ]);
  }

  async findAll(companyId: string, assigneeId?: string) {
    return this.prisma.checklistSchedule.findMany({
      where: {
        companyId,
        isActive: true,
        ...(assigneeId ? { assigneeId } : {}),
      },
      include: SCHEDULE_INCLUDE,
      orderBy: { nextDueAt: 'asc' },
    });
  }

  async findByChecklist(checklistId: string, companyId: string) {
    return this.prisma.checklistSchedule.findFirst({
      where: { checklistId, companyId, isActive: true },
      include: SCHEDULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(companyId: string, userId: string) {
    const now = new Date();
    // 45 dias: cobre itens bloqueados com até ~15 dias de janela de liberação
    const in45days = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    return this.prisma.checklistSchedule.findMany({
      where: {
        companyId,
        assigneeId: userId,
        isActive: true,
        nextDueAt: { lte: in45days },
      },
      include: SCHEDULE_INCLUDE,
      orderBy: { nextDueAt: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const schedule = await this.prisma.checklistSchedule.findFirst({
      where: { id, companyId },
      include: SCHEDULE_INCLUDE,
    });
    if (!schedule) throw new NotFoundException('Agenda não encontrada');
    return schedule;
  }

  async update(id: string, companyId: string, dto: UpdateChecklistScheduleDto) {
    const previous = await this.findOne(id, companyId);
    const updated = await this.prisma.checklistSchedule.update({
      where: { id },
      data: {
        ...dto,
        nextDueAt: dto.nextDueAt ? new Date(dto.nextDueAt) : undefined,
      },
      include: SCHEDULE_INCLUDE,
    });

    // Notifica se o responsável foi atribuído ou alterado
    if (dto.assigneeId && dto.assigneeId !== previous.assignee?.id) {
      await this.notifyAssignee(updated, companyId, 'atribuído a você');
    }

    return updated;
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.checklistSchedule.update({
      where: { id },
      data: { isActive: false },
      include: SCHEDULE_INCLUDE,
    });
  }

  /** Chamado após execução concluída — avança ou encerra a agenda */
  async advanceAfterExecution(checklistId: string, assetId: string | null, companyId: string) {
    const schedule = await this.prisma.checklistSchedule.findFirst({
      where: { checklistId, companyId, isActive: true, assetId: assetId ?? undefined },
    });
    if (!schedule) return;

    if (schedule.repeatDays) {
      const next = new Date(Date.now() + schedule.repeatDays * 24 * 60 * 60 * 1000);
      await this.prisma.checklistSchedule.update({
        where: { id: schedule.id },
        data: { nextDueAt: next },
      });
    } else {
      await this.prisma.checklistSchedule.update({
        where: { id: schedule.id },
        data: { isActive: false },
      });
    }
  }
}
