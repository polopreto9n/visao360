import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const NO_TIMEOUT_KEY = 'no_timeout';

/**
 * Aplica timeout global de 30s em todos os requests.
 * Previne que queries pesadas ou deadlocks travem conexões indefinidamente.
 *
 * Endpoints de upload/export podem usar @SetMetadata(NO_TIMEOUT_KEY, true)
 * para desabilitar o timeout (operações longas legítimas).
 *
 * Sem timeout global, um ataque de "slowloris" ou uma query travada pode
 * esgotar o pool de conexões do banco.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const noTimeout = this.reflector.getAllAndOverride<boolean>(NO_TIMEOUT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (noTimeout) return next.handle();

    return next.handle().pipe(
      timeout(TimeoutInterceptor.DEFAULT_TIMEOUT_MS),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException('Request excedeu o limite de 30 segundos'),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
