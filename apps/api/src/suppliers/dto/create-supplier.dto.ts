import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Elevadores Atlas Ltda' })
  @IsString() @MaxLength(200)
  declare name: string;

  @ApiPropertyOptional({ example: 'Elevadores' })
  @IsString() @MaxLength(100) @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: '(11) 99999-9999' })
  @IsString() @MaxLength(30) @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'contato@atlas.com' })
  @IsEmail() @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString() @MaxLength(1000) @IsOptional()
  notes?: string;
}
