import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

const UNIT_USERS_SELECT = {
  id: true, name: true, email: true, role: true, phone: true, isActive: true,
} as const;

const USER_UNIT_IDS_TTL = 300; // 5 minutos — invalida ao assign/remove

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private userUnitCacheKey(userId: string) {
    return `user:unit-ids:${userId}`;
  }

  async create(companyId: string, dto: CreateUnitDto) {
    if (dto.code) {
      const exists = await this.prisma.unit.findFirst({ where: { code: dto.code, companyId } });
      if (exists) throw new ConflictException(`Código de unidade "${dto.code}" já existe`);
    }
    return this.prisma.unit.create({ data: { ...dto, companyId } });
  }

  async findAll(companyId: string, dto: PaginationDto) {
    const where = {
      companyId, isActive: true,
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { code: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.unit.findMany({
        where,
        include: {
          users: { select: UNIT_USERS_SELECT },
          _count: { select: { assets: true, checklists: true, workOrders: true } },
        },
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
        users: { select: UNIT_USERS_SELECT },
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

  async assignUser(unitId: string, userId: string, companyId: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');

    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const result = await this.prisma.unit.update({
      where: { id: unitId },
      data: { users: { connect: { id: userId } } },
      include: { users: { select: UNIT_USERS_SELECT } },
    });

    // Invalida cache do usuário — suas unidades mudaram
    await this.redis.del(this.userUnitCacheKey(userId));

    return result;
  }

  async removeUser(unitId: string, userId: string, companyId: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: unitId, companyId } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');

    const result = await this.prisma.unit.update({
      where: { id: unitId },
      data: { users: { disconnect: { id: userId } } },
      include: { users: { select: UNIT_USERS_SELECT } },
    });

    // Invalida cache do usuário — suas unidades mudaram
    await this.redis.del(this.userUnitCacheKey(userId));

    return result;
  }

  /**
   * Retorna IDs das unidades do usuário.
   * Cacheado no Redis por 5 minutos — invalidado em assignUser/removeUser.
   * Chamado em quase todo request de TECNICO — cache é crítico para performance.
   */
  async getUserUnitIds(userId: string): Promise<string[]> {
    return this.redis.getOrSet(
      this.userUnitCacheKey(userId),
      async () => {
        const user = await this.prisma.user.findFirst({
          where: { id: userId },
          select: { assignedUnits: { select: { id: true } } },
        });
        return user?.assignedUnits.map((u) => u.id) ?? [];
      },
      USER_UNIT_IDS_TTL,
    );
  }

  /** Invalida cache de um usuário — chamar ao desativar usuário ou mudar role */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.redis.del(this.userUnitCacheKey(userId));
  }
}
