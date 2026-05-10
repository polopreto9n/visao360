import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateUnitDto) {
    if (dto.code) {
      const exists = await this.prisma.unit.findFirst({
        where: { code: dto.code, companyId },
      });
      if (exists) throw new ConflictException(`Código de unidade "${dto.code}" já existe`);
    }

    return this.prisma.unit.create({
      data: { ...dto, companyId },
    });
  }

  async findAll(companyId: string, dto: PaginationDto) {
    const where = {
      companyId,
      isActive: true,
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { code: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: { _count: { select: { assets: true, checklists: true } } },
        orderBy: { name: 'asc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, companyId },
      include: {
        assets: { where: { status: 'ACTIVE' }, select: { id: true, name: true, category: true, status: true } },
        _count: { select: { assets: true, workOrders: true, incidents: true } },
      },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return unit;
  }

  async update(id: string, companyId: string, dto: UpdateUnitDto) {
    await this.findOne(id, companyId);
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.unit.update({ where: { id }, data: { isActive: false } });
  }
}
