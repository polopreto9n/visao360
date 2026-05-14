import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

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
  company: { id: string; name: string; isActive: boolean; subscriptionStatus: string };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    // Verificar blacklist (logout real)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const blacklisted = await this.redis.get<string>(`token:blacklist:${token}`);
      if (blacklisted) {
        throw new UnauthorizedException('Token revogado. Faça login novamente.');
      }
    }

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
        company: {
          select: {
            id: true,
            name: true,
            isActive: true,
            subscriptionStatus: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido ou usuário desativado');
    }

    if (!user.company.isActive) {
      throw new UnauthorizedException('Empresa desativada');
    }

    // Bloqueia SUSPENDED e CANCELLED — acesso completamente vedado
    if (
      user.company.subscriptionStatus === 'SUSPENDED' ||
      user.company.subscriptionStatus === 'CANCELLED'
    ) {
      throw new UnauthorizedException(
        user.company.subscriptionStatus === 'CANCELLED'
          ? 'Assinatura cancelada. Entre em contato com o suporte para reativar.'
          : 'Assinatura suspensa por falta de pagamento. Use POST /api/v1/subscriptions/recover para regularizar.',
      );
    }

    // Trial expirado — bloqueia e orienta a assinar um plano
    if (
      user.company.subscriptionStatus === 'TRIAL' &&
      user.company.trialEndsAt &&
      new Date() > user.company.trialEndsAt
    ) {
      throw new UnauthorizedException(
        'Período de avaliação encerrado. Escolha um plano para continuar usando o Visão360.',
      );
    }

    return user;
  }
}
