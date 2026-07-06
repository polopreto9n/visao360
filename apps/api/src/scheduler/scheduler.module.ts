import { Module } from '@nestjs/common';
import { ChecklistSchedulesModule } from '../checklist-schedules/checklist-schedules.module';
import { DocumentsModule } from '../documents/documents.module';
import { SchedulerService } from './scheduler.service';

// RedisService é @Global() — disponível sem importar RedisModule explicitamente
@Module({
  imports: [ChecklistSchedulesModule, DocumentsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
