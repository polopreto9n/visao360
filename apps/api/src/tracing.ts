/**
 * OpenTelemetry — Distributed Tracing Setup
 *
 * IMPORTANTE: Este arquivo deve ser importado ANTES de qualquer outro módulo NestJS.
 * Adicionar em main.ts como primeira linha:
 *   import './tracing';
 *
 * Dependências a instalar:
 *   npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
 *               @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
 *               @opentelemetry/semantic-conventions
 *
 * Padrão usado por: Google Cloud Trace, Datadog APM, Grafana Tempo, Jaeger.
 *
 * Com OpenTelemetry ativo, cada request gera um trace com spans para:
 * - Recebimento HTTP
 * - Queries do Prisma (duração de cada SQL)
 * - Chamadas Redis
 * - Chamadas a serviços externos (fetch, Supabase, Expo)
 *
 * Isso permite responder: "por que o request /work-orders demorou 2 segundos?"
 * e ver exatamente qual query foi lenta.
 */

// Verificar se os pacotes estão disponíveis antes de inicializar
function setupTracing() {
  if (process.env.OTEL_ENABLED !== 'true') {
    return; // Desabilitado por padrão — ativar com OTEL_ENABLED=true
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require('@opentelemetry/resources');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

    const sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'visao360-api',
        [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
        'deployment.environment': process.env.NODE_ENV ?? 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
          '@opentelemetry/instrumentation-ioredis': { enabled: true },
          '@opentelemetry/instrumentation-fs': { enabled: false }, // muito verboso
        }),
      ],
    });

    sdk.start();
    console.log('[OpenTelemetry] Tracing iniciado');

    process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
  } catch {
    console.warn('[OpenTelemetry] Pacotes não instalados — tracing desabilitado');
    console.warn('[OpenTelemetry] Instale: npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node');
  }
}

setupTracing();
