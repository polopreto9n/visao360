import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListWorkOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus) @IsOptional()
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ enum: WorkOrderPriority })
  @IsEnum(WorkOrderPriority) @IsOptional()
  priority?: WorkOrderPriority;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  unitId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Filtrar somente OSs com prazo vencido' })
  @IsBoolean() @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  overdue?: boolean;
}
