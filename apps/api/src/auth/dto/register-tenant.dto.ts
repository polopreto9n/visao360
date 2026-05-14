import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ description: 'Nome da empresa/administradora', example: 'João Gestão Predial' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare companyName: string;

  @ApiProperty({ description: 'CNPJ da empresa (opcional)', example: '12.345.678/0001-99', required: false })
  @IsOptional()
  @IsString()
  cnpj?: string;

  @ApiProperty({ description: 'E-mail corporativo da empresa', example: 'contato@joaogestao.com.br' })
  @IsEmail()
  declare companyEmail: string;

  @ApiProperty({ description: 'Nome completo do responsável (síndico/OWNER)', example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  declare ownerName: string;

  @ApiProperty({ description: 'E-mail de login do OWNER', example: 'joao@joaogestao.com.br' })
  @IsEmail()
  declare ownerEmail: string;

  @ApiProperty({ description: 'Senha de acesso (mínimo 8 caracteres)' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  declare password: string;

  @ApiProperty({ description: 'Telefone do responsável', example: '(11) 99999-9999', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
