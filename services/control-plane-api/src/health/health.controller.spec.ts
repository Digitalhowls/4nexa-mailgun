import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const mockHealth = { check: jest.fn() };

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealth }],
    }).compile();
    controller = module.get(HealthController);
  });

  describe('check()', () => {
    it('delega en HealthService.check() y retorna el resultado', async () => {
      const expected = { status: 'ok', db: 'ok', redis: 'ok', uptime: 42 };
      mockHealth.check.mockResolvedValue(expected);

      const result = await controller.check();

      expect(result).toBe(expected);
      expect(mockHealth.check).toHaveBeenCalledTimes(1);
    });

    it('propaga el error si HealthService.check() lanza', async () => {
      mockHealth.check.mockRejectedValue(new Error('DB timeout'));

      await expect(controller.check()).rejects.toThrow('DB timeout');
    });
  });
});
