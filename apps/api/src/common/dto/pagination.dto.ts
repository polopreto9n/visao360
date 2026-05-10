import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Busca por texto' })
  @IsString()
  @IsOptional()
  search?: string;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export function paginated<T>(data: T[], total: number, dto: PaginationDto) {
  return {
    data,
    total,
    page: dto.page,
    limit: dto.limit,
    totalPages: Math.ceil(total / dto.limit),
  };
}
