import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkOrderPriority } from '@prisma/client';

export class CreateWorkOrderDto {
  @ApiProperty({ example: 'Troca de cabo de aço do elevador' })
  @IsString() @MaxLength(200) declare title: string;

  @ApiProperty({ example: 'O cabo de aço apresenta desgaste excessivo...' })
  @IsString() @MaxLength(2000) declare description: string;

  @ApiProperty({ description: 'ID da unidade' })
  @IsString() declare unitId: string;

  @ApiPropertyOptional({ description: 'ID do equipamento relacionado' })
  @IsString() @IsOptional() assetId?: string;

  @ApiPropertyOptional({ description: 'ID do técnico responsável' })
  @IsString() @IsOptional() assigneeId?: string;

  @ApiPropertyOptional({ enum: WorkOrderPriority, default: WorkOrderPriority.MEDIUM })
  @IsEnum(WorkOrderPriority) @IsOptional()
  priority?: WorkOrderPriority = WorkOrderPriority.MEDIUM;

  @ApiPropertyOptional({ description: 'Prazo (ISO 8601)', example: '2024-08-01T00:00:00.000Z' })
  @IsDateString() @IsOptional() dueDate?: string;
}
