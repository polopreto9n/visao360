import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

// Extende a interface Request do Express com dados do tenant
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      // Verifica se a empresa está ativa e existe
      const company = await this.prisma.company.findFirst({
        where: { id: payload.companyId, isActive: true },
        select: { id: true },
      });

      if (!company) {
        throw new UnauthorizedException('Empresa não encontrada ou desativada');
      }

      req.tenantId = payload.companyId;
      req.userId = payload.sub;

      this.logger.debug(`Tenant resolvido: ${payload.companyId} | User: ${payload.sub}`);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      // Token inválido/expirado — deixa o JwtAuthGuard lidar
      this.logger.debug('Token inválido no TenantMiddleware — será rejeitado pelo JwtAuthGuard');
    }

    next();
  }
}
