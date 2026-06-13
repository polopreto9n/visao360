import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class MonthlyReportDto {
  @ApiProperty({ example: 'clxxx...' })
  @IsString()
  declare unitId: string;

  @ApiProperty({ example: 6, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(12)
  declare month: number;

  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsInt() @Min(2000) @Max(2100)
  declare year: number;
}
