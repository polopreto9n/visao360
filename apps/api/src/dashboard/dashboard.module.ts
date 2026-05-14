import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { UnitsModule } from '../units/units.module';

@Module({ imports: [UnitsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
