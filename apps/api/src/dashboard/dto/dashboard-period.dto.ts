import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export const DASHBOARD_PERIODS = ['today', '7d', '30d', 'month', 'custom'] as const;
export type DashboardPeriodFilter = (typeof DASHBOARD_PERIODS)[number];

export class DashboardPeriodDto {
  @ApiPropertyOptional({
    description: 'ID do condominio selecionado no dashboard',
    example: 'cm0unit123',
  })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({
    description: 'Periodo global selecionado no dashboard',
    enum: DASHBOARD_PERIODS,
    example: '30d',
  })
  @IsIn(DASHBOARD_PERIODS)
  @IsOptional()
  period?: DashboardPeriodFilter;

  @ApiPropertyOptional({
    description: 'Data inicial do periodo personalizado no formato YYYY-MM-DD',
    example: '2026-05-01',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data final do periodo personalizado no formato YYYY-MM-DD',
    example: '2026-05-21',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
