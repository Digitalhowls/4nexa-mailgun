import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type HealthStatus = 'ok' | 'error';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  db: HealthStatus;
  redis: HealthStatus;
  uptime: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [db, redis] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      db,
      redis,
      uptime: Math.floor(process.uptime()),
    };
  }

  private async checkDb(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<HealthStatus> {
    try {
      const pong = await this.redis.client.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
