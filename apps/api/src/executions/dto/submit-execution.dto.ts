import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExecutionItemAnswerDto {
  @ApiProperty() @IsString() declare checklistItemId: string;
  @ApiProperty() @IsBoolean() declare answer: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() photoUrl?: string;
}

export class SubmitExecutionDto {
  @ApiProperty({ type: [ExecutionItemAnswerDto] })
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true }) @Type(() => ExecutionItemAnswerDto)
  declare items: ExecutionItemAnswerDto[];

  @ApiPropertyOptional({ description: 'Observações gerais da execução' })
  @IsString() @IsOptional() notes?: string;

  @ApiPropertyOptional({ description: 'URL da assinatura digital (base64 ou storage)' })
  @IsString() @IsOptional() signatureUrl?: string;
}
