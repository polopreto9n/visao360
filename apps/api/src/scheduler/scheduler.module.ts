import { Module } from '@nestjs/common';
import { ChecklistSchedulesModule } from '../checklist-schedules/checklist-schedules.module';
import { SchedulerService } from './scheduler.service';

// RedisService é @Global() — disponível sem importar RedisModule explicitamente
@Module({
  imports: [ChecklistSchedulesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
