import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChecklistScheduleDto } from './create-checklist-schedule.dto';

export class UpdateChecklistScheduleDto extends PartialType(CreateChecklistScheduleDto) {
  @IsBoolean() @IsOptional() isActive?: boolean;
}
