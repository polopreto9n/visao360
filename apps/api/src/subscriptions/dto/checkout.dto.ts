import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutDto {
  @ApiProperty({ example: 'PROFESSIONAL', enum: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] })
  @IsString()
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  declare plan: string;
}
