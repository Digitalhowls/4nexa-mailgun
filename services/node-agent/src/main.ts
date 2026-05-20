import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createLogger } from '@4nexa/logger';
import { AppModule } from './app.module';
import type { AgentEnvConfig } from './config/env.schema';

const logger = createLogger({ service: 'node-agent' });

async function bootstrap(): Promise<void> {
  // Leer vars TLS de process.env para configurar Fastify antes de que el módulo arranque
  const tlsCert = process.env['AGENT_TLS_CERT_PEM'];
  const tlsKey = process.env['AGENT_TLS_KEY_PEM'];
  const tlsCa = process.env['AGENT_TLS_CA_PEM'];
  const mtlsEnabled = Boolean(tlsCert && tlsKey && tlsCa);

  const fastifyOptions = mtlsEnabled
    ? {
        logger: false,
        https: {
          cert: tlsCert as string,
          key: tlsKey as string,
          ca: tlsCa as string,
          // Requerir y verificar el certificado del cliente (Control Plane)
          requestCert: true,
          rejectUnauthorized: true,
        },
      }
    : { logger: false };

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(fastifyOptions),
  );

  const cfgSvc = app.get(ConfigService<AgentEnvConfig, true>);
  const port = cfgSvc.get('AGENT_PORT');
  const host = cfgSvc.get('AGENT_HOST');
  const nodeId = cfgSvc.get('AGENT_NODE_ID');
  const nodeEnv = cfgSvc.get('NODE_ENV');

  app.setGlobalPrefix('agent');

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('4nexa Node Agent')
      .setDescription('API del agente instalado en cada mail node')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('agent/docs', app, document);
  }

  await app.listen(port, host);

  const proto = mtlsEnabled ? 'https' : 'http';
  logger.info(
    { port, host, nodeId, nodeEnv, mtlsEnabled },
    `Node Agent escuchando en ${proto}://${host}:${port}/agent`,
  );
}

bootstrap().catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.fatal(error, 'Error fatal al inicializar Node Agent');
  process.exit(1);
});
