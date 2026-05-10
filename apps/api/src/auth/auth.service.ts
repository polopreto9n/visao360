import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Retorna todas as empresas onde o e-mail está cadastrado */
  async findCompaniesByEmail(email: string) {
    const users = await this.prisma.user.findMany({
      where: { email, isActive: true },
      select: {
        company: {
          select: { id: true, name: true, logoUrl: true, isActive: true },
        },
      },
    });

    return users
      .filter((u) => u.company.isActive)
      .map((u) => u.company);
  }

  /** Autentica usuário e retorna JWT + dados do usuário */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        companyId: dto.companyId,
        isActive: true,
      },
      include: {
        company: { select: { id: true, name: true, logoUrl: true, isActive: true } },
      },
    });

    // Evitar timing attack — sempre faz o compare mesmo sem usuário
    const dummyHash = '$2b$12$invalidhashfortimingreference00000';
    const isValid = await bcrypt.compare(dto.password, user?.passwordHash ?? dummyHash);

    if (!user || !isValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.company.isActive) {
      throw new UnauthorizedException('Empresa desativada. Contate o suporte.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
    };

    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET', `${this.config.get('JWT_SECRET')}_refresh`);

    return {
      accessToken: this.jwt.sign(payload),
      refreshToken: this.jwt.sign(payload, { secret: refreshSecret, expiresIn: '30d' }),
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 86400),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        companyId: user.companyId,
        company: user.company,
      },
    };
  }

  /** Emite novo access token a partir de um refresh token válido */
  async refresh(refreshToken: string) {
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET', `${this.config.get('JWT_SECRET')}_refresh`);
    try {
      const payload = this.jwt.verify<JwtPayload>(refreshToken, { secret: refreshSecret });
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, companyId: payload.companyId, isActive: true },
        include: { company: { select: { id: true, name: true, logoUrl: true, isActive: true } } },
      });
      if (!user || !user.company.isActive) throw new UnauthorizedException();
      const newPayload: JwtPayload = { sub: user.id, email: user.email, companyId: user.companyId, role: user.role };
      return {
        accessToken: this.jwt.sign(newPayload),
        expiresIn: this.config.get<number>('JWT_EXPIRES_IN', 86400),
      };
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado. Faça login novamente.');
    }
  }

  /** Cria novo usuário na empresa do solicitante */
  async register(dto: RegisterDto, companyId: string, requestingRole: Role) {
    // Apenas ADMINs criam outros ADMINs
    if (dto.role === Role.ADMIN && requestingRole !== Role.ADMIN) {
      throw new UnauthorizedException('Somente ADMINs podem criar usuários com role ADMIN');
    }

    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email, companyId },
    });

    if (exists) {
      throw new ConflictException(`E-mail ${dto.email} já está cadastrado nesta empresa`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        companyId,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role ?? Role.TECNICO,
        phone: dto.phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        companyId: true,
        createdAt: true,
      },
    });

    return user;
  }

  /** Dados do usuário autenticado */
  async me(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        avatarUrl: true,
        companyId: true,
        lastLoginAt: true,
        createdAt: true,
        company: {
          select: { id: true, name: true, logoUrl: true, email: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    return user;
  }

  /** Atualiza senha do usuário autenticado */
  async changePassword(
    userId: string,
    companyId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId, isActive: true },
      select: { id: true, passwordHash: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Senha atual incorreta');

    const newHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return { message: 'Senha atualizada com sucesso' };
  }
}
