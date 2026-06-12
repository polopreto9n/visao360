import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const ALERT_SEVERITIES = ['CRITICO', 'ALTO', 'MEDIO', 'INFORMATIVO'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export class ListAlertsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ALERT_SEVERITIES })
  @IsIn(ALERT_SEVERITIES)
  @IsOptional()
  severity?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Somente alertas ainda nao lidos' })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  unreadOnly?: boolean;
}
