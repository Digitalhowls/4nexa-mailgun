import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@4nexa/logger';

const logger = createLogger({ service: 'prisma' });

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    logger.info({}, 'Conexión a PostgreSQL establecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    logger.info({}, 'Conexión a PostgreSQL cerrada');
  }
}
