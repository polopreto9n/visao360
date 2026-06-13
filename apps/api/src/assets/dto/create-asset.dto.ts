import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssetStatus } from '@prisma/client';

export class CreateAssetDto {
  @ApiProperty({ example: 'Elevador Social Torre B' })
  @IsString() @MaxLength(200)
  declare name: string;

  @ApiProperty({ example: 'clxxx...' })
  @IsString()
  declare unitId: string;

  @ApiProperty({ example: 'Elevadores' })
  @IsString() @MaxLength(100)
  declare category: string;

  @ApiPropertyOptional({ example: 'ELV-002' })
  @IsString() @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'ThyssenKrupp' })
  @IsString() @MaxLength(100) @IsOptional()
  brand?: string;

  @ApiPropertyOptional({ example: 'Atlas 3000' })
  @IsString() @MaxLength(100) @IsOptional()
  model?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(100) @IsOptional()
  serialNumber?: string;

  @ApiPropertyOptional({ enum: AssetStatus, default: AssetStatus.ACTIVE })
  @IsEnum(AssetStatus) @IsOptional()
  status?: AssetStatus = AssetStatus.ACTIVE;

  @ApiPropertyOptional()
  @IsDateString() @IsOptional()
  installDate?: string;

  @ApiPropertyOptional()
  @IsDateString() @IsOptional()
  nextMaintenanceAt?: string;

  @ApiPropertyOptional()
  @IsDateString() @IsOptional()
  warrantyUntil?: string;

  @ApiPropertyOptional()
  @IsDateString() @IsOptional()
  contractUntil?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(1000) @IsOptional()
  description?: string;
}
