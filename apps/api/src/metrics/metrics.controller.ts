import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { Public } from '../common/decorators/public.decorator';
import { SkipAudit } from '../common/interceptors/audit.interceptor';

/**
 * Endpoint de métricas Prometheus.
 * Protegido por rede (não exposto publicamente) — apenas Prometheus/Grafana acessa.
 * Em produção, restringir via firewall/ingress ao IP do Prometheus.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @SkipAudit()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  collect(): string {
    return this.metrics.export();
  }
}
