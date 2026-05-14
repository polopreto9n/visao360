import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-tenant')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // máx 5 signups/min por IP
  @ApiOperation({
    summary: 'Signup público — cria empresa + usuário OWNER + inicia trial de 14 dias',
    description: 'Endpoint chamado na landing page. Não requer autenticação.',
  })
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 tentativas por minuto por IP
  @ApiOperation({ summary: 'Login — retorna JWT e dados do usuário' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 refreshes por minuto
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Logout — invalida access + refresh token no servidor' })
  logout(
    @Headers('authorization') authHeader: string,
    @Body() dto: LogoutDto,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';
    return this.authService.logout(accessToken, dto.refreshToken);
  }

  @Get('find-companies')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Busca empresas pelo e-mail (pré-login)',
    description: 'Retorna as empresas onde o e-mail está cadastrado, para o usuário escolher',
  })
  @ApiQuery({ name: 'email', type: String, example: 'admin@visao360.com.br' })
  findCompanies(@Query('email') email: string) {
    return this.authService.findCompaniesByEmail(email);
  }

  @Post('register')
  @Roles(Role.ADMIN, Role.GESTOR)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Criar usuário na empresa (ADMIN ou GESTOR)' })
  register(@Body() dto: RegisterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.register(dto, user.companyId, user.role as Role);
  }

  @Get('me')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Retorna dados do usuário autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id, user.companyId);
  }

  @Patch('change-password')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Alterar senha (invalida token atual)' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('authorization') authHeader: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';
    return this.authService.changePassword(
      user.id,
      user.companyId,
      dto.currentPassword,
      dto.newPassword,
      accessToken,
    );
  }
}
