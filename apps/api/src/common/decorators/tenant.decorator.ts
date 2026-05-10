import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injeta o tenantId (companyId) extraído pelo TenantMiddleware */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
    return request.tenantId ?? '';
  },
);
