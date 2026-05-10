import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { NotificationType, Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.OPEN]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.ASSIGNED]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.OPEN, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.IN_PROGRESS]: [WorkOrderStatus.WAITING_PARTS, WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.WAITING_PARTS]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

const WO_INCLUDE = {
  unit: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true, category: true, qrCode: true } },
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async generateCode(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.workOrder.count({ where: { companyId } });
    return `OS-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(companyId: string, creatorId: string, dto: CreateWorkOrderDto) {
    const [unit, assignee] = await Promise.all([
      this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } }),
      dto.assigneeId
        ? this.prisma.user.findFirst({ where: { id: dto.assigneeId, companyId } })
        : Promise.resolve(null),
    ]);
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    if (dto.assigneeId && !assignee) throw new NotFoundException('Técnico não encontrado');
    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, companyId } });
      if (!asset) throw new NotFoundException('Equipamento não encontrado');
    }
    const code = await this.generateCode(companyId);
    const wo = await this.prisma.workOrder.create({
      data: {
        ...dto, companyId, creatorId, code,
        status: dto.assigneeId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.OPEN,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: WO_INCLUDE,
    });
    if (dto.assigneeId && assignee) {
      await this.notifications.create({
        companyId, userId: dto.assigneeId,
        type: NotificationType.WORK_ORDER_ASSIGNED,
        title: `Nova OS atribuida: ${code}`,
        body: `"${dto.title}" - Prioridade: ${dto.priority}`,
        data: { workOrderId: wo.id, code },
      });
    }
    return wo;
  }

  async findAll(companyId: string, dto: PaginationDto & { status?: WorkOrderStatus; unitId?: string; assigneeId?: string; priority?: string; overdue?: boolean }) {
    const where: Record<string, unknown> = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : {}),
      ...(dto.assigneeId ? { assigneeId: dto.assigneeId } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.overdue ? { dueDate: { lt: new Date() }, status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] } } : {}),
      ...(dto.search ? { OR: [{ code: { contains: dto.search, mode: 'insensitive' } }, { title: { contains: dto.search, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({ where, include: WO_INCLUDE, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], skip: dto.skip, take: dto.limit }),
      this.prisma.workOrder.count({ where }),
    ]);
    return paginated(data, total, dto);
  }

  async findMyOrders(companyId: string, userId: string) {
    return this.prisma.workOrder.findMany({
      where: { companyId, assigneeId: userId, status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] } },
      include: WO_INCLUDE,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });
  }

  async findOne(id: string, companyId: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, companyId }, include: WO_INCLUDE });
    if (!wo) throw new NotFoundException('Ordem de servico nao encontrada');
    return wo;
  }

  async updateStatus(id: string, companyId: string, userId: string, userRole: Role, dto: UpdateStatusDto) {
    const wo = await this.findOne(id, companyId);
    if (userRole === Role.TECNICO && wo.assigneeId !== userId) {
      throw new ForbiddenException('Tecnicos so podem atualizar OS atribuidas a eles');
    }
    const allowed = TRANSITIONS[wo.status as WorkOrderStatus];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Transicao invalida: ${wo.status} -> ${dto.status}. Permitido: ${allowed.join(', ')}`);
    }
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: dto.status, notes: dto.notes ?? wo.notes,
        startedAt: dto.status === WorkOrderStatus.IN_PROGRESS ? new Date() : wo.startedAt,
        completedAt: dto.status === WorkOrderStatus.COMPLETED ? new Date() : wo.completedAt,
      },
      include: WO_INCLUDE,
    });
    if ((dto.status === WorkOrderStatus.COMPLETED || dto.status === WorkOrderStatus.CANCELLED) && wo.creatorId !== userId) {
      const statusLabel = dto.status === WorkOrderStatus.COMPLETED ? 'concluida' : 'cancelada';
      await this.notifications.create({
        companyId, userId: wo.creatorId,
        type: NotificationType.SYSTEM,
        title: `OS ${wo.code} ${statusLabel}`,
        body: `A OS "${wo.title}" foi ${statusLabel}`,
        data: { workOrderId: id },
      });
    }
    return updated;
  }

  async assign(id: string, companyId: string, assigneeId: string) {
    await this.findOne(id, companyId);
    const assignee = await this.prisma.user.findFirst({ where: { id: assigneeId, companyId } });
    if (!assignee) throw new NotFoundException('Tecnico nao encontrado');
    const wo = await this.prisma.workOrder.update({
      where: { id },
      data: { assigneeId, status: WorkOrderStatus.ASSIGNED },
      include: WO_INCLUDE,
    });
    await this.notifications.create({
      companyId, userId: assigneeId,
      type: NotificationType.WORK_ORDER_ASSIGNED,
      title: `OS atribuida: ${wo.code}`,
      body: `"${wo.title}" foi atribuida a voce`,
      data: { workOrderId: id },
    });
    return wo;
  }
}
