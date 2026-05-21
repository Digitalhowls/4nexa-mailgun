import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import {
  ReputationService,
  REPUTATION_THRESHOLDS,
} from './reputation.service';
import type { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(): PrismaService {
  return {
    node: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    domain: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ReputationService', () => {
  let service: ReputationService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReputationService(prisma);
  });

  // ─── applyNodeDelta() ─────────────────────────────────────────────────────

  describe('applyNodeDelta()', () => {
    it('reduce el reputationScore y lo actualiza en DB', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 80 });
      (prisma.node.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyNodeDelta('node-1', -20);

      expect(result.previousScore).toBe(80);
      expect(result.newScore).toBe(60);
      expect(result.thresholdCrossed).toBe(false);
      expect(prisma.node.update).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: { reputationScore: 60 },
      });
    });

    it('no baja de 0 (clamp mínimo)', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 10 });
      (prisma.node.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyNodeDelta('node-1', -50);
      expect(result.newScore).toBe(0);
    });

    it('no sube de 100 (clamp máximo)', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 95 });
      (prisma.node.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyNodeDelta('node-1', +20);
      expect(result.newScore).toBe(100);
    });

    it('thresholdCrossed=true cuando cruza el umbral crítico de nodo', async () => {
      // Umbral de nodo = 40. Antes: 50 (sobre umbral), después: 30 (bajo umbral)
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 50 });
      (prisma.node.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyNodeDelta('node-1', -20);
      expect(result.newScore).toBe(30);
      expect(result.thresholdCrossed).toBe(true);
    });

    it('thresholdCrossed=false si el score ya estaba bajo el umbral', async () => {
      // Ya está en 30 (bajo umbral 40), no cruza de nuevo
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 30 });
      (prisma.node.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyNodeDelta('node-1', -10);
      expect(result.thresholdCrossed).toBe(false);
    });

    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.applyNodeDelta('nope', -10)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── applyTenantDelta() ───────────────────────────────────────────────────

  describe('applyTenantDelta()', () => {
    it('reduce el trustScore y lo actualiza en DB', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ trustScore: 90 });
      (prisma.tenant.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyTenantDelta('tenant-1', -30);

      expect(result.previousScore).toBe(90);
      expect(result.newScore).toBe(60);
      expect(result.entityType).toBe('tenant');
    });

    it('thresholdCrossed=true cuando cruza el umbral de tenant (60)', async () => {
      // Umbral tenant = 60. Antes: 70, después: 50
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ trustScore: 70 });
      (prisma.tenant.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyTenantDelta('tenant-1', -25);
      expect(result.newScore).toBe(45);
      expect(result.thresholdCrossed).toBe(true);
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.applyTenantDelta('nope', -10)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── applyDomainDelta() ───────────────────────────────────────────────────

  describe('applyDomainDelta()', () => {
    it('reduce el healthScore y lo actualiza en DB', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ healthScore: 80 });
      (prisma.domain.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyDomainDelta('domain-1', -2);

      expect(result.previousScore).toBe(80);
      expect(result.newScore).toBe(78);
      expect(result.entityType).toBe('domain');
    });

    it('thresholdCrossed=true cuando cruza el umbral de dominio (55)', async () => {
      // Umbral domain = 55. Antes: 60, después: 50
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ healthScore: 60 });
      (prisma.domain.update as jest.Mock).mockResolvedValue({});

      const result = await service.applyDomainDelta('domain-1', -15);
      expect(result.newScore).toBe(45);
      expect(result.thresholdCrossed).toBe(true);
    });

    it('lanza NotFoundException si el dominio no existe', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.applyDomainDelta('nope', -5)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getters ─────────────────────────────────────────────────────────────

  describe('getNodeScore()', () => {
    it('devuelve el reputationScore actual', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue({ reputationScore: 75 });
      expect(await service.getNodeScore('node-1')).toBe(75);
    });

    it('lanza NotFoundException si no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getNodeScore('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTenantScore()', () => {
    it('devuelve el trustScore actual', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ trustScore: 85 });
      expect(await service.getTenantScore('tenant-1')).toBe(85);
    });
  });

  describe('getDomainScore()', () => {
    it('devuelve el healthScore actual', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue({ healthScore: 70 });
      expect(await service.getDomainScore('domain-1')).toBe(70);
    });
  });

  describe('getTenantScore() — tenant no encontrado', () => {
    it('lanza NotFoundException si el tenant no existe', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getTenantScore('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDomainScore() — dominio no encontrado', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      (prisma.domain.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getDomainScore('nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Constantes ───────────────────────────────────────────────────────────

  it('REPUTATION_THRESHOLDS tiene los valores del paper §7.4', () => {
    expect(REPUTATION_THRESHOLDS.node).toBe(40);
    expect(REPUTATION_THRESHOLDS.tenant).toBe(60);
    expect(REPUTATION_THRESHOLDS.domain).toBe(55);
  });
});
