import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus, NotificationType, Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { PushService } from '../push/push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsService } from '../units/units.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto, INCIDENT_TRANSITIONS } from './dto/update-incident.dto';

const INCLUDE = {
  unit: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: { id: true, name: true } } },
  },
} as const;

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🚨', HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢',
};

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
    private readonly units: UnitsService,
  ) {}

  private isScopedRole(userRole?: string) {
    return userRole === Role.TECNICO || userRole === Role.CLIENTE;
  }

  private async getScopedUnitIds(userId?: string, userRole?: string) {
    if (!this.isScopedRole(userRole) || !userId) return undefined;
    return this.units.getUserUnitIds(userId);
  }

  async create(companyId: string, reporterId: string, dto: CreateIncidentDto, reporterRole?: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');

    const scopedUnitIds = await this.getScopedUnitIds(reporterId, reporterRole);
    if (scopedUnitIds && !scopedUnitIds.includes(dto.unitId)) {
      throw new ForbiddenException('Voce nao pode registrar ocorrencia nesta unidade');
    }

    const incident = await this.prisma.incident.create({
      data: { ...dto, companyId, reporterId, photoUrls: dto.photoUrls ?? [] },
      include: INCLUDE,
    });

    this.notifyManagers(companyId, reporterId, incident).catch(() => {});
    return incident;
  }

  private async notifyManagers(
    companyId: string,
    reporterId: string,
    incident: { id: string; title: string; severity: string; unit: { name: string }; reporter: { name: string } },
  ) {
    const managers = await this.prisma.user.findMany({
      where: {
        companyId, isActive: true,
        role: { in: [Role.OWNER, Role.ADMIN, Role.GESTOR] },
        id: { not: reporterId },
      },
      select: { id: true },
    });

    const emoji = SEVERITY_EMOJI[incident.severity] ?? '⚠️';
    const title = `${emoji} Nova Ocorrência: ${incident.title}`;
    const body = `${incident.unit.name} · Reportado por ${incident.reporter.name}`;

    await Promise.all(
      managers.map((m) =>
        Promise.all([
          this.push.sendToUser(m.id, companyId, {
            title, body, data: { screen: 'incidents', incidentId: incident.id },
          }),
          this.notifications.create({
            companyId, userId: m.id,
            type: NotificationType.SYSTEM,
            title, body,
            data: { incidentId: incident.id },
          }),
        ]).catch(() => {}),
      ),
    );
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { status?: IncidentStatus; severity?: IncidentSeverity; unitId?: string },
    userId?: string,
    userRole?: string,
  ) {
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds) {
      if (scopedUnitIds.length === 0) return paginated([], 0, dto);
      if (dto.unitId && !scopedUnitIds.includes(dto.unitId)) return paginated([], 0, dto);
    }

    const where = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.severity ? { severity: dto.severity as IncidentSeverity } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : scopedUnitIds ? { unitId: { in: scopedUnitIds } } : {}),
      ...(dto.search
        ? { OR: [{ title: { contains: dto.search, mode: 'insensitive' as const } },
                 { description: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({
        where, include: INCLUDE,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string, userId?: string, userRole?: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, companyId }, include: INCLUDE,
    });
    if (!incident) throw new NotFoundException('Ocorrência não encontrada');
    const scopedUnitIds = await this.getScopedUnitIds(userId, userRole);
    if (scopedUnitIds && !scopedUnitIds.includes(incident.unitId)) {
      throw new ForbiddenException('Ocorrencia nao pertence a uma unidade atribuida a voce');
    }
    return incident;
  }

  async remove(id: string, companyId: string, role: string) {
    if (!['OWNER', 'ADMIN'].includes(role)) {
      throw new BadRequestException('Apenas ADMIN ou OWNER podem excluir ocorrências');
    }
    const incident = await this.findOne(id, companyId);
    await this.prisma.incident.delete({ where: { id: incident.id } });
    return { success: true };
  }

  async updateStatus(id: string, companyId: string, dto: UpdateIncidentStatusDto, userId?: string, userRole?: string) {
    if (userRole === Role.CLIENTE) {
      throw new ForbiddenException('Clientes nao podem atualizar status de ocorrencias');
    }
    const incident = await this.findOne(id, companyId, userId, userRole);

    if (dto.status) {
      const allowed = INCIDENT_TRANSITIONS[incident.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Transição inválida: ${incident.status} → ${dto.status}. Permitido: ${allowed.join(', ')}`,
        );
      }
    }

    return this.prisma.incident.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(dto.status === IncidentStatus.RESOLVED || dto.status === IncidentStatus.CLOSED
          ? { resolvedAt: new Date() }
          : {}),
      },
      include: INCLUDE,
    });
  }

  async assign(id: string, companyId: string, assigneeId: string | null) {
    await this.findOne(id, companyId);
    if (assigneeId) {
      const user = await this.prisma.user.findFirst({ where: { id: assigneeId, companyId, isActive: true } });
      if (!user) throw new NotFoundException('Usuário não encontrado');
    }
    return this.prisma.incident.update({
      where: { id },
      data: { assigneeId },
      include: INCLUDE,
    });
  }

  async addComment(id: string, companyId: string, userId: string, body: string) {
    await this.findOne(id, companyId);
    return this.prisma.incidentComment.create({
      data: { incidentId: id, userId, body },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async deleteComment(id: string, commentId: string, _companyId: string, userId: string, userRole: string) {
    const comment = await this.prisma.incidentComment.findFirst({
      where: { id: commentId, incidentId: id },
    });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    const isOwner = comment.userId === userId;
    const isAdmin = userRole === 'ADMIN' || userRole === 'OWNER';
    if (!isOwner && !isAdmin) throw new ForbiddenException('Sem permissão para excluir este comentário');
    await this.prisma.incidentComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }

  async convertToWorkOrder(
    id: string,
    companyId: string,
    creatorId: string,
    dto: { title: string; description: string; priority: string; assigneeId?: string; dueDate?: string },
  ) {
    const incident = await this.findOne(id, companyId);
    const year = new Date().getFullYear();
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `OS-${year}-${suffix}`;

    const wo = await this.prisma.workOrder.create({
      data: {
        companyId,
        unitId: incident.unitId,
        creatorId,
        code,
        title: dto.title,
        description: dto.description,
        priority: dto.priority as any,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.assigneeId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.OPEN,
      },
    });

    // Atualiza status para INVESTIGATING após criar a OS
    await this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.INVESTIGATING },
    });

    if (dto.assigneeId) {
      await this.notifications.create({
        companyId, userId: dto.assigneeId,
        type: NotificationType.WORK_ORDER_ASSIGNED,
        title: `Nova OS atribuída: ${code}`,
        body: `"${dto.title}" gerada a partir de ocorrência`,
        data: { workOrderId: wo.id, code },
      }).catch(() => {});
    }

    return wo;
  }
}
