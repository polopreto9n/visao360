import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ChecklistType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListChecklistsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ChecklistType }) @IsEnum(ChecklistType) @IsOptional() type?: ChecklistType;
  @ApiPropertyOptional() @IsString() @IsOptional() unitId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() assetId?: string;
}
