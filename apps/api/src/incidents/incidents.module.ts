import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PushModule, NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
