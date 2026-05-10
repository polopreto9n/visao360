import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2)
  declare name: string;

  @ApiProperty({ example: 'joao@empresa.com.br' })
  @IsEmail({}, { message: 'E-mail inválido' })
  declare email: string;

  @ApiProperty({ example: 'Senha@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  declare password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.TECNICO })
  @IsEnum(Role, { message: `Role deve ser: ${Object.values(Role).join(', ')}` })
  @IsOptional()
  role?: Role = Role.TECNICO;

  @ApiPropertyOptional({ example: '(11) 99999-0001' })
  @IsString()
  @IsOptional()
  phone?: string;
}
