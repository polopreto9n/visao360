import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { UnitsModule } from '../units/units.module';

@Module({ imports: [UnitsModule], controllers: [ChecklistsController], providers: [ChecklistsService] })
export class ChecklistsModule {}
