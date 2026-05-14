import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token a ser invalidado (recomendado)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
