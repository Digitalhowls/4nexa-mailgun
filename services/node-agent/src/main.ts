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
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  const config = app.get(ConfigService<AgentEnvConfig, true>);
  const port = config.get('AGENT_PORT');
  const host = config.get('AGENT_HOST');
  const nodeId = config.get('AGENT_NODE_ID');
  const nodeEnv = config.get('NODE_ENV');

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

  logger.info(
    { port, host, nodeId, nodeEnv },
    `Node Agent mock escuchando en http://${host}:${port}/agent`,
  );
}

bootstrap().catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.fatal(error, 'Error fatal al inicializar Node Agent');
  process.exit(1);
});
