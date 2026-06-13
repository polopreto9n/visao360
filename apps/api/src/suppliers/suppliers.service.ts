import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: { ...dto, companyId } });
  }

  async findAll(companyId: string, dto: PaginationDto) {
    const where = {
      companyId, isActive: true,
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { category: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { _count: { select: { workOrders: true } } },
        orderBy: { name: 'asc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOptions(companyId: string) {
    return this.prisma.supplier.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, category: true, phone: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
      include: {
        workOrders: {
          select: { id: true, code: true, title: true, status: true, completedAt: true, cost: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { workOrders: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }

  async update(id: string, companyId: string, dto: UpdateSupplierDto) {
    await this.assertExists(id, companyId);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    await this.assertExists(id, companyId);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }

  private async assertExists(id: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }
}
