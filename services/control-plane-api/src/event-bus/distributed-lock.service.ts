import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { createLogger } from '@4nexa/logger';
import { RedisService } from '../redis/redis.service';

const logger = createLogger({ service: 'control-plane-api', module: 'DistributedLockService' });

/**
 * Lua script para liberar el lock de forma atómica:
 * Solo borra la clave si el valor coincide con el token del dueño,
 * evitando que un proceso libere el lock de otro (§21.6).
 */
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export class LockAcquisitionError extends Error {
  constructor(public readonly lockKey: string) {
    super(`No se pudo adquirir el lock: ${lockKey}`);
    this.name = 'LockAcquisitionError';
  }
}

@Injectable()
export class DistributedLockService {
  private readonly prefix = 'dlock:';

  constructor(private readonly redis: RedisService) {}

  /**
   * Intenta adquirir un lock distribuido.
   * Retorna el token del lock si tiene éxito, null si ya está tomado.
   *
   * @param key     Nombre del recurso a proteger (ej: 'dkim-rotation:domain-uuid')
   * @param ttlMs   Tiempo máximo que se mantiene el lock (failsafe TTL)
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const redisKey = `${this.prefix}${key}`;
    const token = crypto.randomUUID();

    const result = await this.redis.client.set(redisKey, token, 'PX', ttlMs, 'NX');

    if (result === 'OK') {
      logger.debug({ key, ttlMs }, 'Lock adquirido');
      return token;
    }

    logger.debug({ key }, 'Lock ya ocupado — no se pudo adquirir');
    return null;
  }

  /**
   * Libera un lock distribuido de forma atómica.
   * Solo libera si el token coincide (el proceso es el dueño del lock).
   *
   * @returns true si se liberó, false si el token no coincidía o ya había expirado
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const redisKey = `${this.prefix}${key}`;
    const result = await this.redis.client.eval(RELEASE_SCRIPT, 1, redisKey, token) as number;

    if (result === 1) {
      logger.debug({ key }, 'Lock liberado');
      return true;
    }

    logger.warn({ key }, 'No se pudo liberar el lock (token inválido o ya expirado)');
    return false;
  }

  /**
   * Ejecuta una función con lock distribuido.
   * Lanza LockAcquisitionError si no puede adquirir el lock.
   *
   * Uso:
   *   await lockService.withLock('dkim-rotation:domain-uuid', 30_000, async () => {
   *     await rotateDkim(...);
   *   });
   */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = await this.acquireLock(key, ttlMs);
    if (!token) {
      throw new LockAcquisitionError(key);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, token);
    }
  }
}
