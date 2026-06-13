import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { NotificationType, Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { UnitsService } from '../units/units.service';
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
  supplier: { select: { id: true, name: true, category: true, phone: true } },
} as const;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly units: UnitsService,
  ) {}

  private generateCode(): string {
    const year = new Date().getFullYear();
    // Usando randomUUID truncado para evitar race condition no count simultâneo.
    // O @unique([code, companyId]) no schema garante unicidade — colisão é improvável
    // (16^8 = 4 bilhões de combinações) e seria rejeitada com ConflictException.
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `OS-${year}-${suffix}`;
  }

  private isScopedRole(userRole?: string) {
    return userRole === Role.TECNICO || userRole === Role.CLIENTE;
  }

  private async getScopedUnitIds(userId?: string, userRole?: string) {
    if (!this.isScopedRole(userRole) || !userId) return undefined;
    return this.units.getUserUnitIds(userId);
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
    if (dto.assigneeId) {
      const inUnit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, users: { some: { id: dto.assigneeId } } },
      });
      if (!inUnit) throw new BadRequestException('O responsável não pertence a esta unidade');
    }
    if (dto.assetId) {
      const asset = await this.prisma.asset.findFirst({ where: { id: dto.assetId, companyId } });
      if (!asset) throw new NotFoundException('Equipamento não encontrado');
      if (asset.unitId !== dto.unitId) {
        throw new BadRequestException('O equipamento informado nao pertence a unidade da OS');
      }
    }
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, companyId } });
      if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    }
    const code = this.generateCode();
    const wo = await this.prisma.workOrder.create({
      data: {
        ...dto, companyId, creatorId, code,
        status: dto.assigneeId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.OPEN,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: WO_INCLUDE,
    });
    if (dto.assigneeId && assignee) {
      const title = `Nova OS atribuída: ${code}`;
      const body = `"${dto.title}" — Prioridade: ${dto.priority}`;
      await Promise.all([
        this.notifications.create({
          companyId, userId: dto.assigneeId,
          type: NotificationType.WORK_ORDER_ASSIGNED,
          title, body,
          data: { workOrderId: wo.id, code },
        }),
        this.push.sendToUser(dto.assigneeId, companyId, {
          title, body,
          data: { screen: 'orders', workOrderId: wo.id, code },
        }),
      ]);
    }
    return wo;
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & {
      status?: WorkOrderStatus;
      unitId?: string;
      assigneeId?: string;
      assetId?: string;
      priority?: string;
      overdue?: boolean;
    },
    userId?: string,
    userRole?: string,
  ) {
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (scopedUnitIds.length === 0) return paginated([], 0, dto);
      if (dto.unitId && !scopedUnitIds.includes(dto.unitId)) return paginated([], 0, dto);
    }

    const where: Record<string, unknown> = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : scopedUnitIds ? { unitId: { in: scopedUnitIds } } : {}),
      ...(dto.assetId ? { assetId: dto.assetId } : {}),
      // CLIENTE não filtra por assignee — pode ver todas as OS da sua unidade
      ...(dto.assigneeId && userRole !== 'CLIENTE' ? { assigneeId: dto.assigneeId } : {}),
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

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, companyId }, include: WO_INCLUDE });
    if (!wo) throw new NotFoundException('Ordem de servico nao encontrada');
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds && !scopedUnitIds.includes(wo.unitId)) {
      throw new ForbiddenException('OS nao pertence a uma unidade atribuida a voce');
    }
    return wo;
  }

  async updateStatus(id: string, companyId: string, userId: string, userRole: Role, dto: UpdateStatusDto) {
    if (userRole === Role.CLIENTE) {
      throw new ForbiddenException('Clientes nao podem atualizar status de OS');
    }
    const wo = await this.findOne(id, companyId, userId, userRole);
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
        cost: dto.cost ?? wo.cost,
        materialsUsed: dto.materialsUsed ?? wo.materialsUsed,
        supplierId: dto.supplierId ?? wo.supplierId,
        photoUrls: dto.photoUrls?.length ? [...wo.photoUrls, ...dto.photoUrls] : wo.photoUrls,
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

  async delete(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.workOrder.delete({ where: { id } });
    return { deleted: true };
  }

  async assign(id: string, companyId: string, assigneeId: string) {
    const wo = await this.findOne(id, companyId);
    const assignee = await this.prisma.user.findFirst({ where: { id: assigneeId, companyId } });
    if (!assignee) throw new NotFoundException('Tecnico nao encontrado');
    const inUnit = await this.prisma.unit.findFirst({
      where: { id: wo.unitId, users: { some: { id: assigneeId } } },
    });
    if (!inUnit) throw new BadRequestException('O responsável não pertence a esta unidade');
    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: { assigneeId, status: WorkOrderStatus.ASSIGNED },
      include: WO_INCLUDE,
    });
    const title = `OS atribuída: ${updated.code}`;
    const body = `"${updated.title}" foi atribuída a você`;
    await Promise.all([
      this.notifications.create({
        companyId, userId: assigneeId,
        type: NotificationType.WORK_ORDER_ASSIGNED,
        title, body,
        data: { workOrderId: id },
      }),
      this.push.sendToUser(assigneeId, companyId, {
        title, body,
        data: { screen: 'orders', workOrderId: id },
      }),
    ]);
    return updated;
  }
}
