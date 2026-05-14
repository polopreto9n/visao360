import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ChecklistSchedulesModule } from '../checklist-schedules/checklist-schedules.module';

@Module({
  imports: [ChecklistSchedulesModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
})
export class ExecutionsModule {}
