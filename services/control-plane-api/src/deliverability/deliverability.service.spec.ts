import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  DeliverabilityService,
  BLOCK_THRESHOLDS,
  WARMUP_DAILY_LIMITS,
} from './deliverability.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeDomain = (overrides: Record<string, unknown> = {}) => ({
  id: 'domain-1',
  domain: 'acme.com',
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  healthScore: 100,
  nodeId: 'node-1',
  tenant: { trustScore: 100 },
  node: { reputationScore: 100, warmupStatus: 'WARM' },
  ...overrides,
});

let prisma: { domain: { findUnique: jest.Mock } };
let eventBus: { publish: jest.Mock };
let service: DeliverabilityService;

beforeEach(async () => {
  prisma = { domain: { findUnique: jest.fn() } };
  eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DeliverabilityService,
      { provide: 'PrismaService', useValue: prisma },
      { provide: 'EventBusService', useValue: eventBus },
    ],
  })
    .overrideProvider(DeliverabilityService)
    .useFactory({
      factory: () => {
        const s = new DeliverabilityService(prisma as any, eventBus as any);
        return s;
      },
    })
    .compile();

  service = module.get<DeliverabilityService>(DeliverabilityService);
});

// ─── getWarmupDailyLimit ──────────────────────────────────────────────────────

describe('getWarmupDailyLimit', () => {
  it('COLD → 50', () => expect(service.getWarmupDailyLimit('COLD')).toBe(50));
  it('WARMING → 500', () => expect(service.getWarmupDailyLimit('WARMING')).toBe(500));
  it('WARM → null', () => expect(service.getWarmupDailyLimit('WARM')).toBeNull());
  it('desconocido → null', () => expect(service.getWarmupDailyLimit('UNKNOWN')).toBeNull());
});

// ─── computeThrottleRate ──────────────────────────────────────────────────────

describe('computeThrottleRate', () => {
  it('todos al 100 → throttle 0', () => {
    expect(service.computeThrottleRate(100, 100, 100)).toBe(0);
  });

  it('todos al 0 → throttle 100', () => {
    expect(service.computeThrottleRate(0, 0, 0)).toBe(100);
  });

  it('todos al 50 → throttle 50', () => {
    expect(service.computeThrottleRate(50, 50, 50)).toBe(50);
  });

  it('node bajo pesa 40%', () => {
    // combined = 0.40*50 + 0.30*100 + 0.30*100 = 20+30+30 = 80 → throttle 20
    expect(service.computeThrottleRate(50, 100, 100)).toBe(20);
  });
});

// ─── checkSendPermission ──────────────────────────────────────────────────────

describe('checkSendPermission', () => {
  it('lanza NotFoundException si el dominio no existe', async () => {
    prisma.domain.findUnique.mockResolvedValue(null);
    await expect(service.checkSendPermission('no-domain')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite envío cuando todo está en orden', async () => {
    prisma.domain.findUnique.mockResolvedValue(makeDomain());

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(true);
    expect(result.blockReasons).toHaveLength(0);
    expect(result.throttleRate).toBe(0);
    expect(result.warmupDailyLimit).toBeNull();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('bloquea si el dominio no está ACTIVE', async () => {
    prisma.domain.findUnique.mockResolvedValue(makeDomain({ status: 'SUSPENDED' }));

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(false);
    expect(result.blockReasons).toContain('domain_not_active: estado=SUSPENDED');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deliverability.blocked' }),
    );
  });

  it('bloquea si no hay nodo asignado', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ nodeId: null, node: null }),
    );

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(false);
    expect(result.blockReasons).toContain('no_node_assigned');
  });

  it('bloquea por aislamiento de nodo cuando reputación < umbral', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({
        node: { reputationScore: BLOCK_THRESHOLDS.nodeReputation - 1, warmupStatus: 'WARM' },
      }),
    );

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(false);
    expect(result.blockReasons.some(r => r.startsWith('node_isolated'))).toBe(true);
  });

  it('bloquea por tenant con trustScore bajo', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({
        tenant: { trustScore: BLOCK_THRESHOLDS.tenantTrust - 1 },
      }),
    );

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(false);
    expect(result.blockReasons.some(r => r.startsWith('tenant_blocked'))).toBe(true);
  });

  it('bloquea por healthScore de dominio bajo', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ healthScore: BLOCK_THRESHOLDS.domainHealth - 1 }),
    );

    const result = await service.checkSendPermission('domain-1');

    expect(result.allowed).toBe(false);
    expect(result.blockReasons.some(r => r.startsWith('domain_blocked'))).toBe(true);
  });

  it('bloquea cuando volumen estimado supera límite warmup COLD', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ node: { reputationScore: 100, warmupStatus: 'COLD' } }),
    );

    const result = await service.checkSendPermission('domain-1', 100);

    expect(result.allowed).toBe(false);
    expect(result.volumeExceedsLimit).toBe(true);
    expect(result.warmupDailyLimit).toBe(WARMUP_DAILY_LIMITS.COLD);
    expect(result.blockReasons.some(r => r.startsWith('warmup_limit_exceeded'))).toBe(true);
  });

  it('permite cuando volumen está dentro del límite warmup WARMING', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ node: { reputationScore: 100, warmupStatus: 'WARMING' } }),
    );

    const result = await service.checkSendPermission('domain-1', 499);

    expect(result.allowed).toBe(true);
    expect(result.volumeExceedsLimit).toBe(false);
    expect(result.warmupDailyLimit).toBe(WARMUP_DAILY_LIMITS.WARMING);
  });

  it('acumula múltiples razones de bloqueo', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({
        status: 'SUSPENDED',
        healthScore: 20,
        tenant: { trustScore: 30 },
        node: { reputationScore: 10, warmupStatus: 'COLD' },
      }),
    );

    const result = await service.checkSendPermission('domain-1', 1000);

    expect(result.blockReasons.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── getDomainGovernance ──────────────────────────────────────────────────────

describe('getDomainGovernance', () => {
  it('lanza NotFoundException si el dominio no existe', async () => {
    prisma.domain.findUnique.mockResolvedValue(null);
    await expect(service.getDomainGovernance('no-domain')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve governance completo cuando todo está en orden', async () => {
    prisma.domain.findUnique.mockResolvedValue(makeDomain());

    const gov = await service.getDomainGovernance('domain-1');

    expect(gov.allowed).toBe(true);
    expect(gov.nodeWarmupStatus).toBe('WARM');
    expect(gov.warmupDailyLimit).toBeNull();
    expect(gov.throttleRate).toBe(0);
    expect(gov.domain).toBe('acme.com');
  });

  it('NO emite evento (solo lectura)', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ status: 'SUSPENDED' }),
    );

    await service.getDomainGovernance('domain-1');

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('informa warmupDailyLimit 500 si nodo en WARMING', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ node: { reputationScore: 100, warmupStatus: 'WARMING' } }),
    );

    const gov = await service.getDomainGovernance('domain-1');

    expect(gov.warmupDailyLimit).toBe(500);
    expect(gov.nodeWarmupStatus).toBe('WARMING');
  });

  it('marca blocked cuando no hay nodo asignado (línea 241)', async () => {
    prisma.domain.findUnique.mockResolvedValue(makeDomain({ nodeId: null, node: null }));
    const gov = await service.getDomainGovernance('domain-1');
    expect(gov.allowed).toBe(false);
    expect(gov.blockReasons).toContain('no_node_assigned');
  });

  it('marca blocked cuando reputación del nodo < umbral (línea 249)', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ node: { reputationScore: BLOCK_THRESHOLDS.nodeReputation - 1, warmupStatus: 'WARM' } }),
    );
    const gov = await service.getDomainGovernance('domain-1');
    expect(gov.blockReasons.some((r: string) => r.startsWith('node_isolated'))).toBe(true);
  });

  it('marca blocked cuando trustScore del tenant < umbral (línea 252)', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ tenant: { trustScore: BLOCK_THRESHOLDS.tenantTrust - 1 } }),
    );
    const gov = await service.getDomainGovernance('domain-1');
    expect(gov.blockReasons.some((r: string) => r.startsWith('tenant_blocked'))).toBe(true);
  });

  it('marca blocked cuando healthScore del dominio < umbral (línea 255)', async () => {
    prisma.domain.findUnique.mockResolvedValue(
      makeDomain({ healthScore: BLOCK_THRESHOLDS.domainHealth - 1 }),
    );
    const gov = await service.getDomainGovernance('domain-1');
    expect(gov.blockReasons.some((r: string) => r.startsWith('domain_blocked'))).toBe(true);
  });
});
