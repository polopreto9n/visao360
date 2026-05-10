import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@visao360.com.br', description: 'E-mail do usuário' })
  @IsEmail({}, { message: 'E-mail inválido' })
  declare email: string;

  @ApiProperty({ example: 'admin@123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  declare password: string;

  @ApiProperty({
    example: 'clxxx...',
    description: 'ID da empresa (tenant). Obtido via GET /auth/find-companies',
  })
  @IsString()
  declare companyId: string;
}
