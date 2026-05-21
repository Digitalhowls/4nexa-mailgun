import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BillingMeterService } from './billing-meter.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeTenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-1',
  billingStatus: 'ACTIVE',
  trustScore: 100,
  planId: 'plan-1',
  plan: {
    maxMailboxes: 10,
    maxDomains: 5,
    storageTotalBytes: BigInt(1_000_000_000), // 1 GB
    outboundDailyLimit: 1000,
  },
  ...overrides,
});

let prisma: {
  tenant: { findUnique: jest.Mock; update: jest.Mock };
  mailbox: { count: jest.Mock; aggregate: jest.Mock };
  domain: { count: jest.Mock };
  mailEvent: { count: jest.Mock };
};
let eventBus: { publish: jest.Mock };
let service: BillingMeterService;

beforeEach(async () => {
  prisma = {
    tenant:    { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    mailbox:   {
      count:     jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue({ _sum: { usedBytes: BigInt(500_000) } }),
    },
    domain:    { count: jest.fn().mockResolvedValue(2) },
    mailEvent: { count: jest.fn().mockResolvedValue(50) },
  };
  eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BillingMeterService,
      { provide: 'PrismaService', useValue: prisma },
      { provide: 'EventBusService', useValue: eventBus },
    ],
  })
    .overrideProvider(BillingMeterService)
    .useFactory({
      factory: () => new BillingMeterService(prisma as any, eventBus as any),
    })
    .compile();

  service = module.get<BillingMeterService>(BillingMeterService);
});

// ─── getMeterSnapshot ─────────────────────────────────────────────────────────

describe('getMeterSnapshot', () => {
  it('lanza NotFoundException si el tenant no existe', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.getMeterSnapshot('no-tenant')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve snapshot con conteos reales', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.tenantId).toBe('tenant-1');
    expect(snap.mailboxCount).toBe(3);
    expect(snap.domainCount).toBe(2);
    expect(snap.usedStorageBytes).toBe(500_000);
    expect(snap.outboundTodayCount).toBe(50);
    expect(snap.billingStatus).toBe('ACTIVE');
  });

  it('no hay overages cuando el uso está dentro del plan', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.overages.mailboxes).toBe(false);
    expect(snap.overages.domains).toBe(false);
    expect(snap.overages.storage).toBe(false);
  });

  it('detecta overage de mailboxes cuando se supera el límite', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.mailbox.count.mockResolvedValue(15); // plan.maxMailboxes = 10

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.overages.mailboxes).toBe(true);
  });

  it('detecta overage de storage', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.mailbox.aggregate.mockResolvedValue({
      _sum: { usedBytes: BigInt(2_000_000_000) }, // > 1 GB
    });

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.overages.storage).toBe(true);
  });

  it('devuelve planLimits null si no hay plan asignado', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant({ planId: null, plan: null }));

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.planLimits.maxMailboxes).toBeNull();
    expect(snap.planLimits.maxDomains).toBeNull();
  });

  it('usa BigInt(0) cuando _sum.usedBytes es null (cubre línea 118)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());
    prisma.mailbox.aggregate.mockResolvedValue({ _sum: { usedBytes: null } });

    const snap = await service.getMeterSnapshot('tenant-1');

    expect(snap.usedStorageBytes).toBe(0);
  });
});

// ─── transitionBillingStatus ──────────────────────────────────────────────────

describe('transitionBillingStatus', () => {
  it('lanza NotFoundException si el tenant no existe', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(
      service.transitionBillingStatus('no-tenant', { newStatus: 'GRACE', reason: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('transiciona ACTIVE → GRACE correctamente', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant());

    const result = await service.transitionBillingStatus('tenant-1', {
      newStatus: 'GRACE',
      reason: 'Pago pendiente',
    });

    expect(result.previousStatus).toBe('ACTIVE');
    expect(result.newStatus).toBe('GRACE');
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { billingStatus: 'GRACE' } }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'billing.status_changed', newStatus: 'GRACE' }),
    );
  });

  it('transiciona GRACE → ACTIVE (reactivación)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant({ billingStatus: 'GRACE' }));

    const result = await service.transitionBillingStatus('tenant-1', {
      newStatus: 'ACTIVE',
      reason: 'Pago recibido',
    });

    expect(result.newStatus).toBe('ACTIVE');
  });

  it('lanza BadRequestException para transición no válida', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant({ billingStatus: 'ACTIVE' }));

    await expect(
      service.transitionBillingStatus('tenant-1', {
        newStatus: 'SUSPENDED',
        reason: 'test',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usa [] cuando previousStatus no está en VALID_TRANSITIONS (cubre línea 178)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(makeTenant({ billingStatus: 'UNKNOWN_STATUS' as any }));

    await expect(
      service.transitionBillingStatus('tenant-1', { newStatus: 'ACTIVE' as any, reason: 'test' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza SUSPENDED si no hay overages ni trustScore bajo', async () => {
    // RESTRICTED → SUSPENDED requiere causa real
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ billingStatus: 'RESTRICTED', trustScore: 100 }),
    );
    // Sin overages (dentro del plan)
    prisma.mailbox.count.mockResolvedValue(3);
    prisma.domain.count.mockResolvedValue(2);
    prisma.mailbox.aggregate.mockResolvedValue({ _sum: { usedBytes: BigInt(100) } });
    prisma.mailEvent.count.mockResolvedValue(10);

    await expect(
      service.transitionBillingStatus('tenant-1', {
        newStatus: 'SUSPENDED',
        reason: 'intento de suspensión sin causa',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite SUSPENDED con overage de mailboxes (anti-fraud)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ billingStatus: 'RESTRICTED', trustScore: 100 }),
    );
    // Overage: 15 mailboxes > 10 del plan
    prisma.mailbox.count.mockResolvedValue(15);
    prisma.domain.count.mockResolvedValue(2);
    prisma.mailbox.aggregate.mockResolvedValue({ _sum: { usedBytes: BigInt(100) } });
    prisma.mailEvent.count.mockResolvedValue(10);

    const result = await service.transitionBillingStatus('tenant-1', {
      newStatus: 'SUSPENDED',
      reason: 'Overage persistente',
    });

    expect(result.newStatus).toBe('SUSPENDED');
  });

  it('permite SUSPENDED con trustScore bajo (anti-fraud)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(
      makeTenant({ billingStatus: 'RESTRICTED', trustScore: 30 }),
    );
    // Sin overages
    prisma.mailbox.count.mockResolvedValue(3);
    prisma.domain.count.mockResolvedValue(2);
    prisma.mailbox.aggregate.mockResolvedValue({ _sum: { usedBytes: BigInt(100) } });
    prisma.mailEvent.count.mockResolvedValue(10);

    const result = await service.transitionBillingStatus('tenant-1', {
      newStatus: 'SUSPENDED',
      reason: 'Fraude detectado',
    });

    expect(result.newStatus).toBe('SUSPENDED');
  });
});
