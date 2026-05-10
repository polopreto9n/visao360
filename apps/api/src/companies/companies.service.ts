import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        _count: { select: { users: true, units: true, assets: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    await this.findOne(companyId);
    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }

  async getStats(companyId: string) {
    const [users, units, assets, openWorkOrders, openIncidents] = await Promise.all([
      this.prisma.user.count({ where: { companyId, isActive: true } }),
      this.prisma.unit.count({ where: { companyId, isActive: true } }),
      this.prisma.asset.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.workOrder.count({
        where: { companyId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      }),
      this.prisma.incident.count({
        where: { companyId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
    ]);

    return { users, units, assets, openWorkOrders, openIncidents };
  }
}
