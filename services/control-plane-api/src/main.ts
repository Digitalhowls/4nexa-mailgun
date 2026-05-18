import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { createLogger } from '@4nexa/logger';
import type { EnvConfig } from './config/env.schema';

const logger = createLogger({ service: 'control-plane-api' });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Variables de entorno
  const configService = app.get(ConfigService<EnvConfig, true>);
  const port = configService.get('API_PORT');
  const host = configService.get('API_HOST');
  const prefix = configService.get('API_PREFIX');
  const corsOrigins = configService.get('API_CORS_ORIGINS');

  // Prefijo global
  app.setGlobalPrefix(prefix);

  // CORS — solo los orígenes permitidos
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Filtros e interceptores globales
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger (solo en no-producción)
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('4nexa Control Plane API')
      .setDescription('API REST del plano de control de la plataforma de correo gestionado')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document);
    logger.info({}, `Swagger disponible en /${prefix}/docs`);
  }

  await app.listen(port, host);
  logger.info({ port, host, prefix }, `Control Plane API escuchando en ${host}:${port}`);
}

bootstrap().catch((err: unknown) => {
  logger.fatal(err instanceof Error ? err : new Error(String(err)), 'Error fatal al arrancar la API');
  process.exit(1);
});
