import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ExecutionStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListExecutionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ExecutionStatus }) @IsEnum(ExecutionStatus) @IsOptional() status?: ExecutionStatus;
  @ApiPropertyOptional() @IsString() @IsOptional() checklistId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() userId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() assetId?: string;
}
