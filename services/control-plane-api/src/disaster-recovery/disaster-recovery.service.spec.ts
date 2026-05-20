import { DisasterRecoveryService } from './disaster-recovery.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makeEventBus() {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

function makePrisma({
  nodes = [
    { status: 'HEALTHY' },
    { status: 'HEALTHY' },
  ] as { status: string }[],
  domainsTotal = 10,
  lastBackup = { completedAt: new Date(Date.now() - 30 * 60 * 1000) } as { completedAt: Date } | null,
  domainsWithCerts = 8,
} = {}) {
  return {
    node: {
      findMany:   jest.fn().mockResolvedValue(nodes),
      findUnique: jest.fn().mockResolvedValue({ hostname: 'node-test.example.com' }),
      update:     jest.fn().mockResolvedValue({}),
    },
    domain: {
      count: jest.fn()
        .mockResolvedValueOnce(domainsTotal)
        .mockResolvedValueOnce(domainsWithCerts),
    },
    backupJob: {
      findFirst: jest.fn().mockResolvedValue(lastBackup),
    },
  };
}

function makeService(prismaOpts?: Parameters<typeof makePrisma>[0]) {
  return new DisasterRecoveryService(
    makePrisma(prismaOpts) as any,
    makeEventBus() as any,
    makeAudit() as any,
  );
}

// ─── getSystemStatus() ────────────────────────────────────────────────────────

describe('getSystemStatus()', () => {
  it('devuelve healthy=true con nodos sanos y backup reciente', async () => {
    const svc = makeService();
    const result = await svc.getSystemStatus();
    expect(result.healthy).toBe(true);
    expect(result.nodesHealthy).toBe(2);
    expect(result.nodesQuarantined).toBe(0);
  });

  it('devuelve healthy=false si hay nodos en quarantine', async () => {
    const svc = makeService({ nodes: [{ status: 'HEALTHY' }, { status: 'QUARANTINED' }] });
    const result = await svc.getSystemStatus();
    expect(result.healthy).toBe(false);
    expect(result.nodesQuarantined).toBe(1);
  });

  it('devuelve healthy=false si no hay nodos healthy', async () => {
    const svc = makeService({ nodes: [{ status: 'DRAINING' }] });
    const result = await svc.getSystemStatus();
    expect(result.healthy).toBe(false);
  });

  it('calcula lastBackupAge en minutos', async () => {
    // Backup hace ~30 min
    const svc = makeService({ lastBackup: { completedAt: new Date(Date.now() - 30 * 60 * 1000) } });
    const result = await svc.getSystemStatus();
    expect(result.lastBackupAge).toBeGreaterThanOrEqual(29);
    expect(result.lastBackupAge).toBeLessThanOrEqual(31);
  });

  it('lastBackupAge=null si no hay backup', async () => {
    const svc = makeService({ lastBackup: null });
    const result = await svc.getSystemStatus();
    expect(result.lastBackupAge).toBeNull();
  });

  it('incluye checkedAt en formato ISO', async () => {
    const svc = makeService();
    const result = await svc.getSystemStatus();
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── simulate() — dry-run ─────────────────────────────────────────────────────

describe('simulate() dry-run', () => {
  it('devuelve status=DRY_RUN con pasos prefijados con [DRY-RUN]', async () => {
    const svc = makeService();
    const result = await svc.simulate({ scenario: 'node_loss', dryRun: true });
    expect(result.status).toBe('DRY_RUN');
    expect(result.dryRun).toBe(true);
    expect(result.executed.every((e) => e.startsWith('[DRY-RUN]'))).toBe(true);
  });

  it('el plan incluye RTO/RPO y pasos para node_loss', async () => {
    const svc = makeService();
    const result = await svc.simulate({ scenario: 'node_loss', dryRun: true });
    expect(result.plan.rtoMinutes).toBeGreaterThan(0);
    expect(result.plan.rpoMinutes).toBeGreaterThanOrEqual(0);
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });

  it('registra audit log en dry-run', async () => {
    const audit = makeAudit();
    const svc = new DisasterRecoveryService(makePrisma() as any, makeEventBus() as any, audit as any);
    await svc.simulate({ scenario: 'certificate_loss', dryRun: true }, 'user-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dr.certificate_loss', userId: 'user-1' }),
    );
  });

  it('cubre los 4 escenarios distintos', async () => {
    const svc = makeService();
    for (const scenario of ['node_loss', 'postgres_corruption', 'certificate_loss', 'full_cluster_loss'] as const) {
      const result = await svc.simulate({ scenario, dryRun: true });
      expect(result.scenario).toBe(scenario);
      expect(result.plan.steps.length).toBeGreaterThan(0);
    }
  });
});

// ─── simulate() — modo live ───────────────────────────────────────────────────

describe('simulate() live (dryRun=false)', () => {
  it('ejecuta pasos automatizados y devuelve status=COMPLETED', async () => {
    const prisma = makePrisma({ nodes: [{ status: 'HEALTHY' }] });
    const eventBus = makeEventBus();
    const svc = new DisasterRecoveryService(prisma as any, eventBus as any, makeAudit() as any);

    const result = await svc.simulate({
      scenario: 'node_loss',
      dryRun:   false,
      nodeId:   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.dryRun).toBe(false);
    // quarantine_node y audit_reassignment son automatizados → deben estar ejecutados
    expect(result.executed).toContain('quarantine_node');
    expect(result.executed).toContain('audit_reassignment');
  });

  it('cuarentena el nodo en postgres.node.update cuando nodeId se proporciona', async () => {
    const prisma = makePrisma();
    const svc = new DisasterRecoveryService(prisma as any, makeEventBus() as any, makeAudit() as any);

    await svc.simulate({
      scenario: 'node_loss',
      dryRun:   false,
      nodeId:   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });

    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
        data:  { status: 'QUARANTINED' },
      }),
    );
  });

  it('publica evento node.quarantined cuando nodeId se proporciona', async () => {
    const eventBus = makeEventBus();
    const svc = new DisasterRecoveryService(
      makePrisma() as any, eventBus as any, makeAudit() as any,
    );

    await svc.simulate({
      scenario: 'node_loss',
      dryRun:   false,
      nodeId:   'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'node.quarantined', nodeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }),
    );
  });
});
