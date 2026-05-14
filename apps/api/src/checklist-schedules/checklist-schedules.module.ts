import { Module } from '@nestjs/common';
import { ChecklistSchedulesController } from './checklist-schedules.controller';
import { ChecklistSchedulesService } from './checklist-schedules.service';

@Module({
  controllers: [ChecklistSchedulesController],
  providers: [ChecklistSchedulesService],
  exports: [ChecklistSchedulesService],
  imports: [],
})
export class ChecklistSchedulesModule {}
