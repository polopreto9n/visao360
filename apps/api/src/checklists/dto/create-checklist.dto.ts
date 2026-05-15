import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChecklistType } from '@prisma/client';

export class CreateChecklistItemDto {
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) declare order: number;
  @ApiProperty({ example: 'Porta fecha corretamente?' }) @IsString() declare question: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() requiresPhoto?: boolean = false;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() requiresNote?: boolean = false;
  @ApiPropertyOptional({ description: 'Resposta que indica conformidade (true=SIM, false=NÃO)', default: true })
  @IsBoolean() @IsOptional() expectedAnswer?: boolean = true;
}

export class CreateChecklistDto {
  @ApiProperty({ example: 'Inspeção Mensal — Elevadores' })
  @IsString() declare name: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional({ enum: ChecklistType, default: ChecklistType.PREVENTIVE })
  @IsEnum(ChecklistType) @IsOptional()
  type?: ChecklistType = ChecklistType.PREVENTIVE;

  @ApiPropertyOptional({ description: 'ID da unidade vinculada' })
  @IsString() @IsOptional() unitId?: string;

  @ApiPropertyOptional({ description: 'ID do asset vinculado' })
  @IsString() @IsOptional() assetId?: string;

  @ApiPropertyOptional({ description: 'Periodicidade em dias', example: 30 })
  @IsInt() @Min(1) @IsOptional() intervalDays?: number;

  @ApiProperty({ type: [CreateChecklistItemDto] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => CreateChecklistItemDto)
  declare items: CreateChecklistItemDto[];
}
