import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkOrderPriority } from '@prisma/client';

export class UpdateWorkOrderDto {
  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @ApiPropertyOptional({ enum: WorkOrderPriority }) @IsEnum(WorkOrderPriority) @IsOptional() priority?: WorkOrderPriority;
  @ApiPropertyOptional() @IsString() @IsOptional() assigneeId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() assetId?: string;
}
