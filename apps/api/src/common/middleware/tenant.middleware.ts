import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
    }
  }
}

/**
 * Extrai tenantId e userId do JWT sem fazer query ao banco.
 * A validação completa (usuário ativo, empresa ativa, blacklist) é feita pelo JwtAuthGuard + JwtStrategy.
 * Isso elimina a query duplicada de DB que existia anteriormente neste middleware.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);

    try {
      // Apenas decodifica (não verifica assinatura) para extrair tenant ID
      // A verificação completa acontece no JwtStrategy.validate()
      const payload = this.jwtService.decode<JwtPayload>(token);

      if (payload?.companyId && payload?.sub) {
        req.tenantId = payload.companyId;
        req.userId = payload.sub;
        this.logger.debug(`Tenant: ${payload.companyId} | User: ${payload.sub}`);
      }
    } catch {
      // Token malformado — JwtAuthGuard vai rejeitar na rota
    }

    next();
  }
}
