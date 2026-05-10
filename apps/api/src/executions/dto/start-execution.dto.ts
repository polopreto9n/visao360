import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StartExecutionDto {
  @ApiProperty({ description: 'ID do template de checklist' })
  @IsString() declare checklistId: string;

  @ApiPropertyOptional({ description: 'ID do asset vinculado (opcional)' })
  @IsString() @IsOptional() assetId?: string;
}
