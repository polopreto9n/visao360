import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';

interface CreateNotificationInput {
  companyId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria uma notificação para um usuário específico */
  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      },
    });
  }

  /** Cria notificações para todos os ADMIN/GESTOR da empresa */
  async notifyManagers(
    companyId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Prisma.InputJsonValue,
  ) {
    const managers = await this.prisma.user.findMany({
      where: { companyId, role: { in: ['ADMIN', 'GESTOR'] }, isActive: true },
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: managers.map((m) => ({
        companyId, userId: m.id, type, title, body, data: (data ?? {}) as Prisma.InputJsonObject,
      })),
    });
  }

  /** Lista notificações do usuário autenticado */
  async findAll(userId: string, companyId: string, dto: PaginationDto & { unreadOnly?: boolean }) {
    const where = {
      userId,
      companyId,
      ...(dto.unreadOnly ? { isRead: false } : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, companyId, isRead: false } }),
    ]);

    return { ...paginated(data, total, dto), unreadCount };
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, companyId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, companyId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async delete(id: string, userId: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  async getUnreadCount(userId: string, companyId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, companyId, isRead: false },
    });
    return { count };
  }
}
