import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Serviço de métricas compatível com Prometheus.
 *
 * Implementação leve sem dependência externa — expõe contadores e histogramas
 * via endpoint /api/v1/metrics no formato texto do Prometheus.
 *
 * Para produção séria, instalar:
 *   npm install prom-client @willsoto/nestjs-prometheus
 *
 * Métricas expostas:
 * - http_requests_total: total de requests por método, path e status
 * - http_request_duration_ms: histograma de latência por endpoint
 * - auth_login_attempts_total: tentativas de login (success/failure)
 * - auth_token_refresh_total: rotações de refresh token
 * - db_query_duration_ms: latência de queries lentas
 * - upload_total: uploads por tipo e resultado
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  // Contadores simples — em produção usar prom-client Counter
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  onModuleInit() {
    this.logger.log('MetricsService iniciado — endpoint: /api/v1/metrics');
  }

  increment(metric: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.buildKey(metric, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observe(metric: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.buildKey(metric, labels);
    const existing = this.histograms.get(key) ?? [];
    existing.push(value);
    // Manter apenas os últimos 1000 valores para evitar leak de memória
    if (existing.length > 1000) existing.shift();
    this.histograms.set(key, existing);
  }

  /** Exporta métricas no formato texto do Prometheus */
  export(): string {
    const lines: string[] = [
      '# HELP visao360_api Visão360 API Metrics',
      '# TYPE http_requests_total counter',
    ];

    for (const [key, value] of this.counters.entries()) {
      lines.push(`${key} ${value}`);
    }

    lines.push('# TYPE http_request_duration_ms summary');
    for (const [key, values] of this.histograms.entries()) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const sum = sorted.reduce((a, b) => a + b, 0);
      lines.push(`${key}{quantile="0.5"} ${p50}`);
      lines.push(`${key}{quantile="0.95"} ${p95}`);
      lines.push(`${key}{quantile="0.99"} ${p99}`);
      lines.push(`${key}_sum ${sum}`);
      lines.push(`${key}_count ${sorted.length}`);
    }

    return lines.join('\n') + '\n';
  }

  private buildKey(metric: string, labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return metric;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',');
    return `${metric}{${labelStr}}`;
  }
}
