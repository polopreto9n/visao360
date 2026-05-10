import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class FindCompaniesDto {
  @ApiProperty({ example: 'admin@visao360.com.br' })
  @IsEmail({}, { message: 'E-mail inválido' })
  declare email: string;
}
