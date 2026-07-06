import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private computeStatus(expiryDate?: Date | null, alertDays = 30): DocumentStatus {
    if (!expiryDate) return DocumentStatus.VALID;
    const now = new Date();
    if (expiryDate < now) return DocumentStatus.EXPIRED;
    const alertDate = new Date(expiryDate);
    alertDate.setDate(alertDate.getDate() - alertDays);
    if (now >= alertDate) return DocumentStatus.EXPIRING_SOON;
    return DocumentStatus.VALID;
  }

  async create(companyId: string, dto: CreateDocumentDto) {
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : undefined;
    const status = this.computeStatus(expiryDate, dto.alertDays);
    return this.prisma.document.create({
      data: {
        ...dto,
        companyId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate,
        status,
      },
      include: {
        unit: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, category: true } },
      },
    });
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { status?: DocumentStatus; unitId?: string; type?: string; expiringSoon?: boolean },
  ) {
    const where: Record<string, unknown> = {
      companyId,
      isActive: true,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : {}),
      ...(dto.type ? { type: { contains: dto.type, mode: 'insensitive' } } : {}),
      ...(dto.expiringSoon
        ? { status: { in: [DocumentStatus.EXPIRING_SOON, DocumentStatus.EXPIRED] } }
        : {}),
      ...(dto.search
        ? { OR: [
            { name: { contains: dto.search, mode: 'insensitive' } },
            { type: { contains: dto.search, mode: 'insensitive' } },
          ] }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          unit: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, category: true } },
        },
        orderBy: [{ expiryDate: 'asc' }, { name: 'asc' }],
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.document.count({ where }),
    ]);
    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, companyId },
      include: {
        unit: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, category: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return doc;
  }

  async update(id: string, companyId: string, dto: Partial<CreateDocumentDto>) {
    await this.findOne(id, companyId);
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : undefined;
    const current = await this.prisma.document.findUnique({ where: { id }, select: { expiryDate: true, alertDays: true } });
    const finalExpiry = expiryDate ?? current?.expiryDate ?? undefined;
    const finalAlertDays = dto.alertDays ?? current?.alertDays ?? 30;
    const status = this.computeStatus(finalExpiry, finalAlertDays);
    return this.prisma.document.update({
      where: { id },
      data: {
        ...dto,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate,
        status,
      },
      include: {
        unit: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, category: true } },
      },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.document.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  }

  async refreshStatuses(companyId: string) {
    const docs = await this.prisma.document.findMany({
      where: { companyId, isActive: true, expiryDate: { not: null } },
      select: { id: true, expiryDate: true, alertDays: true },
    });
    let updated = 0;
    for (const doc of docs) {
      const newStatus = this.computeStatus(doc.expiryDate ?? undefined, doc.alertDays);
      await this.prisma.document.update({ where: { id: doc.id }, data: { status: newStatus } });
      updated++;
    }
    return { updated };
  }
}
