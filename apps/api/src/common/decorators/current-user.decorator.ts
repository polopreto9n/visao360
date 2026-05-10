import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/** Injeta o usuário autenticado (validado pelo JwtStrategy) no parâmetro */
export const CurrentUser = createParamDecorator(
  (_data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
