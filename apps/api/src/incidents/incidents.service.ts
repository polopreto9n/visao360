import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto, INCIDENT_TRANSITIONS } from './dto/update-incident.dto';

const INCLUDE = {
  unit: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, reporterId: string, dto: CreateIncidentDto) {
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');

    return this.prisma.incident.create({
      data: { ...dto, companyId, reporterId, photoUrls: dto.photoUrls ?? [] },
      include: INCLUDE,
    });
  }

  async findAll(
    companyId: string,
    dto: PaginationDto & { status?: IncidentStatus; severity?: IncidentSeverity; unitId?: string },
  ) {
    const where = {
      companyId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.severity ? { severity: dto.severity as IncidentSeverity } : {}),
      ...(dto.unitId ? { unitId: dto.unitId } : {}),
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

  async findOne(id: string, companyId: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, companyId }, include: INCLUDE,
    });
    if (!incident) throw new NotFoundException('Incidente não encontrado');
    return incident;
  }

  async updateStatus(id: string, companyId: string, dto: UpdateIncidentStatusDto) {
    const incident = await this.findOne(id, companyId);

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
}
