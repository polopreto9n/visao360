import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { IncidentSeverity } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty({ example: 'Vazamento na bomba hidráulica B2' })
  @IsString() @MaxLength(200)
  declare title: string;

  @ApiProperty({ example: 'Identificado vazamento de água na bomba...' })
  @IsString() @MaxLength(2000)
  declare description: string;

  @ApiProperty({ description: 'ID da unidade' })
  @IsString()
  declare unitId: string;

  @ApiPropertyOptional({ enum: IncidentSeverity, default: IncidentSeverity.MEDIUM })
  @IsEnum(IncidentSeverity) @IsOptional()
  severity?: IncidentSeverity = IncidentSeverity.MEDIUM;

  @ApiPropertyOptional({ type: [String], description: 'URLs de fotos/evidências' })
  @IsArray() @IsUrl({}, { each: true }) @IsOptional()
  photoUrls?: string[] = [];
}
