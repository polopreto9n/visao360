import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_START_HEADER = 'x-request-start';

/**
 * Injeta um Correlation ID em cada request.
 * - Reutiliza o header do cliente se presente (permite rastreamento end-to-end)
 * - Propaga o ID na response para correlação no frontend/mobile
 * - Registra método, path e duração de cada request
 *
 * Em sistemas distribuídos, o correlation ID permite rastrear uma operação
 * do mobile → API → banco em logs centralizados (Datadog, Grafana Loki, etc.)
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Reutiliza correlation ID do cliente (tracing end-to-end) ou gera um novo
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID();

    const startTime = Date.now();

    // Injeta no objeto de request para uso nos services/logs
    (req as Request & { correlationId?: string }).correlationId = correlationId;

    // Propaga na response — cliente pode correlacionar request e resposta
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          res.setHeader('x-response-time', `${duration}ms`);
        },
        error: () => {
          // duração também disponível em caso de erro (capturado pelo AllExceptionsFilter)
          res.setHeader('x-response-time', `${Date.now() - startTime}ms`);
        },
      }),
    );
  }
}
