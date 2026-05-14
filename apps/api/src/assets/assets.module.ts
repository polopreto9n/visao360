import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { UnitsModule } from '../units/units.module';

@Module({ imports: [UnitsModule], controllers: [AssetsController], providers: [AssetsService] })
export class AssetsModule {}
