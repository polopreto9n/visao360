import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@visao360.com.br', description: 'E-mail do usuário' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254) // RFC 5321: tamanho máximo de endereço de e-mail
  declare email: string;

  @ApiProperty({ example: 'SenhaSegura@123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(128, { message: 'Senha muito longa' }) // previne bcrypt DoS (strings muito longas são lentas)
  declare password: string;

  @ApiProperty({
    example: 'clxxx...',
    description: 'ID da empresa (tenant). Obtido via GET /auth/find-companies',
  })
  @IsString()
  declare companyId: string;
}
