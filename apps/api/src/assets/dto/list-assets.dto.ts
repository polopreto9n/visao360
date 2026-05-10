import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssetStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListAssetsDto extends PaginationDto {
  @ApiPropertyOptional() @IsString() @IsOptional() unitId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional({ enum: AssetStatus }) @IsEnum(AssetStatus) @IsOptional() status?: AssetStatus;
}
