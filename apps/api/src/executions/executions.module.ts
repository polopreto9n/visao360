import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ChecklistSchedulesModule } from '../checklist-schedules/checklist-schedules.module';
import { UnitsModule } from '../units/units.module';

@Module({
  imports: [ChecklistSchedulesModule, UnitsModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
})
export class ExecutionsModule {}
