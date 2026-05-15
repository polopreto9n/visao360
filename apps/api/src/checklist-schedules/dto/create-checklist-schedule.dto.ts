import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateChecklistScheduleDto {
  @ApiProperty({ description: 'ID do checklist' })
  @IsString() declare checklistId: string;

  @ApiPropertyOptional({ description: 'ID do equipamento (opcional)' })
  @IsString() @IsOptional() assetId?: string;

  @ApiPropertyOptional({ description: 'ID do técnico responsável' })
  @IsString() @IsOptional() assigneeId?: string;

  @ApiPropertyOptional({ description: 'Nome da agenda (ex: Inspeção Torre A)' })
  @IsString() @IsOptional() name?: string;

  @ApiProperty({ description: 'Data/hora da próxima execução (ISO 8601)', example: '2026-06-01T08:00:00.000Z' })
  @IsDateString() declare nextDueAt: string;

  @ApiPropertyOptional({ description: 'Repetir a cada X dias. Null = execução única.' })
  @IsInt() @Min(1) @IsOptional() repeatDays?: number;

  @ApiPropertyOptional({ description: 'Enviar aviso X dias antes da data prevista. 0 = no próprio dia.' })
  @IsInt() @Min(0) @IsOptional() reminderDaysBefore?: number;

  @ApiPropertyOptional({ description: 'Dias antes do vencimento em que o checklist fica disponível.', default: 3 })
  @IsInt() @Min(0) @IsOptional() releaseBeforeDays?: number;

  @ApiPropertyOptional({ description: 'Dias de tolerância após o vencimento antes de expirar.', default: 2 })
  @IsInt() @Min(0) @IsOptional() toleranceDays?: number;
}
