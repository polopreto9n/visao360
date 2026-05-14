import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CorrelationInterceptor } from './common/interceptors/correlation.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    abortOnError: false,
    // rawBody: true popula req.rawBody em TODOS os requests —
    // obrigatório para stripe.webhooks.constructEvent() funcionar.
    rawBody: true,
  });

  // Graceful shutdown hooks (Prisma disconnect, Redis quit, etc.)
  app.enableShutdownHooks();

  // Logger estruturado (Pino)
  app.useLogger(app.get(Logger));

  // CORS — validado no env.validation: nunca wildcard em produção
  const rawOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  if (rawOrigin === '*' && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN=* é proibido em produção. Defina a URL exata.');
  }
  app.enableCors({
    origin: rawOrigin === '*' ? true : rawOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-idempotency-key'],
  });

  // Prefixo global + versionamento URI (/api/v1/...)
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validação global de DTOs — whitelist bloqueia campos extras, transform converte tipos
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // Filtro global de exceções — sanitiza erros 500 em produção
  app.useGlobalFilters(new AllExceptionsFilter());

  // Interceptors globais — ordem importa: correlation primeiro, timeout depois
  const reflector = app.get(Reflector);
  const prisma = app.get(PrismaService);
  app.useGlobalInterceptors(
    new CorrelationInterceptor(),              // x-correlation-id + x-response-time
    new TimeoutInterceptor(reflector),         // aborta requests após 30s
    new AuditInterceptor(prisma, reflector),   // grava POST/PATCH/DELETE em audit_logs
  );

  // Swagger (apenas fora de produção)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Visão360 API')
      .setDescription(
        'API REST de gestão predial — Plataforma SaaS Visão360\n\n' +
          '**Multi-tenant**: inclua o `companyId` no login para obter o token.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'jwt',
      )
      .addTag('Auth', 'Autenticação e autorização')
      .addTag('Companies', 'Gestão de empresas/tenants')
      .addTag('Users', 'Gestão de usuários')
      .addTag('Units', 'Gestão de unidades/condomínios')
      .addTag('Assets', 'Gestão de equipamentos')
      .addTag('Checklists', 'Templates de checklists')
      .addTag('Executions', 'Execução de checklists')
      .addTag('WorkOrders', 'Ordens de serviço')
      .addTag('Dashboard', 'KPIs e métricas')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 API rodando em http://localhost:${port}/api/v1`, 'Bootstrap');
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger em http://localhost:${port}/api/docs`, 'Bootstrap');
  }

  // Graceful shutdown — SIGTERM é enviado pelo Railway/Docker no deploy/stop
  const shutdown = async (signal: string) => {
    logger.log(`${signal} recebido — encerrando servidor gracefully...`, 'Bootstrap');
    await app.close();
    logger.log('Servidor encerrado.', 'Bootstrap');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('❌ Falha ao iniciar a aplicação:', err);
  process.exit(1);
});
