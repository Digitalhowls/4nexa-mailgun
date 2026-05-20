import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const mockQueryRaw = jest.fn();
const mockPrisma = { $queryRaw: mockQueryRaw };

const mockPing = jest.fn();
const mockRedis = { client: { ping: mockPing } };

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    service = module.get(HealthService);
  });

  describe('check()', () => {
    it('retorna status ok cuando DB y Redis están disponibles', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const result = await service.check();

      expect(result.status).toBe('ok');
      expect(result.db).toBe('ok');
      expect(result.redis).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('retorna status degraded cuando DB falla', async () => {
      mockQueryRaw.mockRejectedValue(new Error('connection refused'));
      mockPing.mockResolvedValue('PONG');

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.db).toBe('error');
      expect(result.redis).toBe('ok');
    });

    it('retorna status degraded cuando Redis falla', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.db).toBe('ok');
      expect(result.redis).toBe('error');
    });

    it('retorna redis error cuando ping retorna valor distinto de PONG', async () => {
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('OK'); // no es 'PONG'

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.redis).toBe('error');
    });

    it('retorna status degraded cuando ambos servicios fallan', async () => {
      mockQueryRaw.mockRejectedValue(new Error('DB down'));
      mockPing.mockRejectedValue(new Error('Redis down'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.db).toBe('error');
      expect(result.redis).toBe('error');
    });
  });
});
