import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, paginated } from '../common/dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true, name: true, email: true, role: true,
  phone: true, avatarUrl: true, isActive: true,
  lastLoginAt: true, createdAt: true, companyId: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  async deactivate(id: string, companyId: string, requestingId: string) {
    if (id === requestingId) {
      throw new ForbiddenException('Você não pode desativar sua própria conta');
    }
    await this.findOne(id, companyId);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }
}
