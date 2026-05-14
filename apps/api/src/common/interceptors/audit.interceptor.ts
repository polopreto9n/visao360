import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/** Marcar endpoint com @SkipAudit() para não gravar no audit log */
export const SKIP_AUDIT_KEY = 'skip_audit';
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);

// Apenas mutações são auditadas — GET não gera log de auditoria
const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Grava ações críticas na tabela audit_logs (criada na migration 20260513000000).
 *
 * Registra: quem, o quê, quando, de onde, com qual resultado.
 * Permite investigar: "quem cancelou essa OS?", "quem desativou esse usuário?"
 *
 * Impacto de performance: gravação assíncrona (fire-and-forget) — não bloqueia a resposta.
 * Falha na gravação do audit log nunca afeta a resposta ao cliente.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser; correlationId?: string }>();

    if (!AUDITED_METHODS.has(req.method)) return next.handle();

    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipAudit) return next.handle();

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.writeAuditLog(req, 200, Date.now() - startTime);
        },
        error: (err: unknown) => {
          const status = (err as { status?: number })?.status ?? 500;
          this.writeAuditLog(req, status, Date.now() - startTime);
        },
      }),
    );
  }

  private writeAuditLog(
    req: Request & { user?: AuthenticatedUser },
    statusCode: number,
    durationMs: number,
  ): void {
    // Fire-and-forget: nunca bloqueia a resposta, nunca propaga erro
    const resource = this.extractResource(req.path);
    const resourceId = this.extractResourceId(req.path);

    this.prisma.auditLog
      .create({
        data: {
          companyId: req.user?.companyId ?? null,
          userId: req.user?.id ?? null,
          action: req.method,
          resource,
          resourceId,
          statusCode,
          ip: this.extractIp(req),
          userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
          durationMs,
        },
      })
      .catch(() => {
        // Silencia erro de audit log — disponibilidade > auditoria
      });
  }

  private extractResource(path: string): string {
    // /api/v1/work-orders/abc123 → work-orders
    const parts = path.replace(/^\/api\/v\d+\//, '').split('/');
    return parts[0] ?? 'unknown';
  }

  private extractResourceId(path: string): string | null {
    const parts = path.replace(/^\/api\/v\d+\//, '').split('/');
    return parts[1] && !parts[1].includes('?') ? parts[1] : null;
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress ?? 'unknown';
  }
}
