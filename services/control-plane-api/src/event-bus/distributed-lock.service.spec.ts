import 'reflect-metadata';
import { DistributedLockService, LockAcquisitionError } from './distributed-lock.service';
import type { RedisService } from '../redis/redis.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRedis() {
  return {
    client: {
      set:  jest.fn(),
      eval: jest.fn(),
    },
  } as unknown as RedisService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('DistributedLockService', () => {
  let service: DistributedLockService;
  let redis: RedisService;

  beforeEach(() => {
    redis = makeRedis();
    service = new DistributedLockService(redis);
  });

  // ─── acquireLock() ────────────────────────────────────────────────────────

  describe('acquireLock()', () => {
    it('devuelve un token cuando Redis responde OK (lock adquirido)', async () => {
      (redis.client.set as jest.Mock).mockResolvedValue('OK');

      const token = await service.acquireLock('dkim-rotation:domain-1', 10_000);

      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
      expect(redis.client.set).toHaveBeenCalledWith(
        'dlock:dkim-rotation:domain-1',
        expect.any(String),
        'PX',
        10_000,
        'NX',
      );
    });

    it('devuelve null cuando Redis responde null (lock ya ocupado)', async () => {
      (redis.client.set as jest.Mock).mockResolvedValue(null);

      const token = await service.acquireLock('backup:node-1', 5_000);

      expect(token).toBeNull();
    });
  });

  // ─── releaseLock() ────────────────────────────────────────────────────────

  describe('releaseLock()', () => {
    it('devuelve true cuando el script Lua devuelve 1 (lock liberado)', async () => {
      (redis.client.eval as jest.Mock).mockResolvedValue(1);

      const released = await service.releaseLock('dkim-rotation:domain-1', 'token-abc');

      expect(released).toBe(true);
    });

    it('devuelve false cuando el script Lua devuelve 0 (token no coincide)', async () => {
      (redis.client.eval as jest.Mock).mockResolvedValue(0);

      const released = await service.releaseLock('dkim-rotation:domain-1', 'token-wrong');

      expect(released).toBe(false);
    });
  });

  // ─── withLock() ───────────────────────────────────────────────────────────

  describe('withLock()', () => {
    it('ejecuta la función y libera el lock al terminar', async () => {
      (redis.client.set as jest.Mock).mockResolvedValue('OK');
      (redis.client.eval as jest.Mock).mockResolvedValue(1);

      const fn = jest.fn().mockResolvedValue('resultado');

      const result = await service.withLock('deploy:node-1', 30_000, fn);

      expect(result).toBe('resultado');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(redis.client.eval).toHaveBeenCalledTimes(1);
    });

    it('libera el lock incluso si la función lanza un error', async () => {
      (redis.client.set as jest.Mock).mockResolvedValue('OK');
      (redis.client.eval as jest.Mock).mockResolvedValue(1);

      const fn = jest.fn().mockRejectedValue(new Error('fallo interno'));

      await expect(service.withLock('deploy:node-1', 30_000, fn)).rejects.toThrow('fallo interno');
      expect(redis.client.eval).toHaveBeenCalledTimes(1);
    });

    it('lanza LockAcquisitionError si no puede adquirir el lock', async () => {
      (redis.client.set as jest.Mock).mockResolvedValue(null);

      const fn = jest.fn();

      await expect(service.withLock('deploy:node-1', 30_000, fn)).rejects.toThrow(LockAcquisitionError);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
