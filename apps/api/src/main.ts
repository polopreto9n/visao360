import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Servir uploads locais como arquivos estáticos
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Logger estruturado (Pino)
  app.useLogger(app.get(Logger));

  // CORS
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  });

  // Prefixo global + versionamento
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // Filtro global de exceções
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger (apenas em non-production)
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
}

bootstrap().catch((err) => {
  console.error('❌ Falha ao iniciar a aplicação:', err);
  process.exit(1);
});
