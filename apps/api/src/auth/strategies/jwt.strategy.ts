import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
  company: { id: string; name: string; isActive: boolean };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        companyId: payload.companyId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true, isActive: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido ou usuário desativado');
    }

    if (!user.company.isActive) {
      throw new UnauthorizedException('Empresa desativada');
    }

    return user;
  }
}
