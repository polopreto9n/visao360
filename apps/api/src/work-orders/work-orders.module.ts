import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { UnitsModule } from '../units/units.module';

@Module({ imports: [UnitsModule], controllers: [WorkOrdersController], providers: [WorkOrdersService] })
export class WorkOrdersModule {}
