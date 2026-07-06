import { Module } from '@nestjs/common';
import { PublicReportController } from './public-report.controller';
import { PublicReportService } from './public-report.service';

@Module({
  controllers: [PublicReportController],
  providers: [PublicReportService],
})
export class PublicReportModule {}
