import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - now;
        const status = context.switchToHttp().getResponse<{ statusCode: number }>().statusCode;

        if (ms > 1000) {
          this.logger.warn(`${method} ${url} ${status} — ${ms}ms ⚠️ lento`);
        } else {
          this.logger.debug(`${method} ${url} ${status} — ${ms}ms`);
        }
      }),
    );
  }
}
