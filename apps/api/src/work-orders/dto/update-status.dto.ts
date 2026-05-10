import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkOrderStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus) declare status: WorkOrderStatus;

  @ApiPropertyOptional({ description: 'Observação sobre a transição de status' })
  @IsString() @IsOptional() notes?: string;
}
