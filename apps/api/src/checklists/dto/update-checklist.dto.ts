import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChecklistDto } from './create-checklist.dto';

export class UpdateChecklistDto extends PartialType(OmitType(CreateChecklistDto, ['items'] as const)) {
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}
