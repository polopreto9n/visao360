import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class RecoverDto {
  @ApiProperty({ example: 'joao@gestao.com.br' })
  @IsEmail()
  declare email: string;

  @ApiProperty({ description: 'ID da empresa' })
  @IsString()
  @IsNotEmpty()
  declare companyId: string;

  @ApiProperty({ description: 'Senha atual' })
  @IsString()
  @IsNotEmpty()
  declare password: string;
}
