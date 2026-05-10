import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

class RegisterTokenDto {
  @ApiProperty({ description: 'Expo Push Token (ExponentPushToken[xxx])' })
  @IsString() declare token: string;

  @ApiPropertyOptional({ description: 'Plataforma: ios | android' })
  @IsString() platform?: string = 'unknown';
}

@ApiTags('Push Notifications')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('push')
export class PushController {
  constructor(private readonly svc: PushService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar device token para push notifications' })
  register(@Body() dto: RegisterTokenDto, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.registerToken(u.id, u.companyId, dto.token, dto.platform ?? 'unknown');
  }

  @Delete('unregister')
  @ApiOperation({ summary: 'Remover device token (logout do device)' })
  unregister(@Body() dto: RegisterTokenDto, @CurrentUser() u: AuthenticatedUser) {
    return this.svc.removeToken(u.id, dto.token);
  }
}
