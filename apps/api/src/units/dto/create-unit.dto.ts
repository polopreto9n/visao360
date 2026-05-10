import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'Condomínio Jardim das Flores' })
  @IsString() @MaxLength(200)
  declare name: string;

  @ApiPropertyOptional({ example: 'COND-002' })
  @IsString() @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(500) @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(1000) @IsOptional()
  description?: string;
}
