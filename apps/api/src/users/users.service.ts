import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UnitsService } from '../units/units.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true, name: true, email: true, role: true,
  phone: true, avatarUrl: true, isActive: true,
  lastLoginAt: true, createdAt: true, companyId: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  async findAll(companyId: string, dto: PaginationDto) {
    const where = {
      companyId,
      ...(dto.search
        ? { OR: [{ name: { contains: dto.search, mode: 'insensitive' as const } },
                 { email: { contains: dto.search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where, select: USER_SELECT,
        orderBy: { name: 'asc' },
        skip: dto.skip, take: dto.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginated(data, total, dto);
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId }, select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateUserDto,
    requestingRole: Role,
    requestingId: string,
  ) {
    const target = await this.findOne(id, companyId);

    // OWNER não pode ter seu role alterado por ninguém (nem por outro OWNER)
    if ((target.role as string) === 'OWNER') {
      throw new ForbiddenException(
        'O role OWNER não pode ser alterado. Transfira a titularidade pelo painel de conta.',
      );
    }

    // Ninguém (exceto OWNER via endpoint dedicado) pode promover alguém para OWNER
    if ((dto.role as string) === 'OWNER') {
      throw new ForbiddenException('O role OWNER é exclusivo do fundador do tenant');
    }

    // GESTOR não pode promover para ADMIN nem editar outros ADMINs
    if (requestingRole === Role.GESTOR) {
      if (target.role === Role.ADMIN || dto.role === Role.ADMIN) {
        throw new ForbiddenException('GESTOR não pode gerenciar usuários ADMIN');
      }
    }

    // TECNICO só edita a si mesmo (campos limitados)
    if (requestingRole === Role.TECNICO && id !== requestingId) {
      throw new ForbiddenException('Técnicos só podem editar o próprio perfil');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });

    // Se o role mudou, invalida o cache de unidades — a lógica de filtro pode mudar
    if (dto.role && dto.role !== target.role) {
      await this.units.invalidateUserCache(id);
    }

    return updated;
  }

  async deactivate(id: string, companyId: string, requestingId: string) {
    if (id === requestingId) {
      throw new ForbiddenException('Você não pode desativar sua própria conta');
    }

    const target = await this.findOne(id, companyId);

    // OWNER não pode ser desativado — protege contra lock-out acidental do tenant
    if ((target.role as string) === 'OWNER') {
      throw new ForbiddenException(
        'O OWNER do tenant não pode ser desativado. Cancele a assinatura para encerrar a conta.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    // Invalida cache de unidades do usuário desativado — acesso revogado imediatamente
    await this.units.invalidateUserCache(id);

    return updated;
  }
}
