import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from './redis.service';

// ─── Mock ioredis ──────────────────────────────────────────────────────────

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockQuit = jest.fn().mockResolvedValue('OK');
const mockOn = jest.fn().mockReturnThis();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    quit: mockQuit,
    on: mockOn,
  }));
});

// ─── Helper ────────────────────────────────────────────────────────────────

function makeConfig(): ConfigService<EnvConfig, true> {
  const map: Record<string, unknown> = {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: undefined,
    REDIS_DB: 0,
  };
  return {
    get: (key: string, _opts?: unknown) => map[key],
  } as unknown as ConfigService<EnvConfig, true>;
}

// ─── Suite ─────────────────────────────────────────────────────────────────

describe('RedisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea el cliente Redis al instanciar el servicio', () => {
    const svc = new RedisService(makeConfig());
    expect(svc.client).toBeDefined();
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('onModuleInit() llama a client.connect()', async () => {
    const svc = new RedisService(makeConfig());
    await svc.onModuleInit();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy() llama a client.quit()', async () => {
    const svc = new RedisService(makeConfig());
    await svc.onModuleDestroy();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it('el manejador de error no lanza excepciones', () => {
    new RedisService(makeConfig());
    // Obtener el callback de error registrado y ejecutarlo
    const errorHandler = (mockOn.mock.calls as Array<[string, (...args: unknown[]) => void]>)
      .find(([evt]) => evt === 'error')?.[1];
    expect(() => errorHandler?.(new Error('test error'))).not.toThrow();
  });
});
