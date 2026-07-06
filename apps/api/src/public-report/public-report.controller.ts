import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PublicReportService } from './public-report.service';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

class PublicIncidentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reporterName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reporterPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  photoUrl?: string;
}

@ApiTags('Public Report')
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicReportController {
  constructor(private readonly svc: PublicReportService) {}

  @Get('asset/:qrCode')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Dados públicos do equipamento para reporte' })
  getAssetInfo(@Param('qrCode') qrCode: string) {
    return this.svc.getAssetInfo(qrCode);
  }

  @Post('asset/:qrCode/report')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Registrar ocorrência pública via QR code' })
  report(@Param('qrCode') qrCode: string, @Body() dto: PublicIncidentDto) {
    return this.svc.createPublicReport(qrCode, dto);
  }
}
