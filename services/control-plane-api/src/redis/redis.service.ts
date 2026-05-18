import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createLogger } from '@4nexa/logger';
import type { EnvConfig } from '../config/env.schema';

const logger = createLogger({ service: 'redis' });

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new Redis({
      host: this.config.get('REDIS_HOST'),
      port: this.config.get('REDIS_PORT'),
      password: this.config.get('REDIS_PASSWORD', { infer: true }) ?? undefined,
      db: this.config.get('REDIS_DB'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: true,
    });

    this.client.on('error', (err: Error) => {
      logger.error(err, 'Error en conexión Redis');
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    logger.info({}, 'Conexión a Redis establecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    logger.info({}, 'Conexión a Redis cerrada');
  }
}
