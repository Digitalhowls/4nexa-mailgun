import { AuditService } from './audit.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HMAC_SECRET = 'test-audit-hmac-secret-min-32-chars-ok';

function makeConfig() {
  return {
    get: jest.fn().mockReturnValue(HMAC_SECRET),
  };
}

function makePrisma() {
  return {
    auditLog: {
      create:   jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count:    jest.fn().mockResolvedValue(0),
    },
  };
}

function makeService(prismaOverrides = {}) {
  const prisma = { ...makePrisma(), ...prismaOverrides };
  return {
    service: new AuditService(prisma as any, makeConfig() as any),
    prisma,
  };
}

// ─── computeHmac (función pura) ───────────────────────────────────────────────

describe('computeHmac', () => {
  it('produce un hex de 64 caracteres', () => {
    const { service } = makeService();
    const hmac = service.computeHmac(
      'id-1', 'user.login', 'user', 'user-1', 'tenant-1', 'user-1', new Date(),
    );
    expect(hmac).toHaveLength(64);
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinista con los mismos argumentos', () => {
    const { service } = makeService();
    const date = new Date('2026-05-19T10:00:00.000Z');
    const a = service.computeHmac('id-1', 'user.login', 'user', 'u1', 'tenant-1', 'user-1', date);
    const b = service.computeHmac('id-1', 'user.login', 'user', 'u1', 'tenant-1', 'user-1', date);
    expect(a).toBe(b);
  });

  it('cambia si cualquier campo cambia', () => {
    const { service } = makeService();
    const date = new Date('2026-05-19T10:00:00.000Z');
    const original = service.computeHmac('id-1', 'user.login', null, null, null, null, date);
    const tampered = service.computeHmac('id-1', 'user.TAMPERED', null, null, null, null, date);
    expect(original).not.toBe(tampered);
  });
});

// ─── log() ────────────────────────────────────────────────────────────────────

describe('log()', () => {
  it('llama a prisma.auditLog.create con hmac incluido', async () => {
    const { service, prisma } = makeService();

    await service.log({ action: 'user.login', userId: 'user-1' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'user.login',
          hmac: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
  });

  it('genera id y createdAt explícitos', async () => {
    const { service, prisma } = makeService();

    await service.log({ action: 'node.assigned', entityType: 'node', entityId: 'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3' });

    const callArg = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(callArg.data.id).toBeDefined();
    expect(callArg.data.createdAt).toBeInstanceOf(Date);
  });
});

// ─── verifyIntegrity() ────────────────────────────────────────────────────────

describe('verifyIntegrity()', () => {
  it('devuelve verified=false, legacy=false si el log no existe', async () => {
    const { service } = makeService({
      auditLog: { ...makePrisma().auditLog, findUnique: jest.fn().mockResolvedValue(null) },
    });

    const result = await service.verifyIntegrity('no-such-id');

    expect(result.verified).toBe(false);
    expect(result.legacy).toBe(false);
  });

  it('detecta log legacy (hmac vacío)', async () => {
    const createdAt = new Date();
    const { service } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findUnique: jest.fn().mockResolvedValue({
          id: 'log-1', action: 'user.login', entityType: null, entityId: null,
          tenantId: null, userId: null, createdAt, hmac: '',
        }),
      },
    });

    const result = await service.verifyIntegrity('log-1');

    expect(result.legacy).toBe(true);
    expect(result.verified).toBe(false);
  });

  it('verifica HMAC correcto → verified=true', async () => {
    const { service } = makeService();
    const createdAt = new Date('2026-05-19T10:00:00.000Z');
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const hmac = service.computeHmac(id, 'user.login', null, null, 'tenant-1', 'user-1', createdAt);

    const { service: svc2 } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findUnique: jest.fn().mockResolvedValue({
          id, action: 'user.login', entityType: null, entityId: null,
          tenantId: 'tenant-1', userId: 'user-1', createdAt, hmac,
        }),
      },
    });

    const result = await svc2.verifyIntegrity(id);

    expect(result.verified).toBe(true);
    expect(result.legacy).toBe(false);
  });

  it('detecta log manipulado → verified=false', async () => {
    const { service } = makeService();
    const createdAt = new Date('2026-05-19T10:00:00.000Z');
    const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    // HMAC calculado con action='user.login' pero el log guardado tiene action='TAMPERED'
    const originalHmac = service.computeHmac(id, 'user.login', null, null, null, null, createdAt);

    const { service: svc2 } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findUnique: jest.fn().mockResolvedValue({
          id, action: 'TAMPERED', entityType: null, entityId: null,
          tenantId: null, userId: null, createdAt, hmac: originalHmac,
        }),
      },
    });

    const result = await svc2.verifyIntegrity(id);

    expect(result.verified).toBe(false);
  });
});

// ─── verifyRange() ────────────────────────────────────────────────────────────

describe('verifyRange()', () => {
  it('devuelve totales correctos para logs válidos', async () => {
    const { service } = makeService();
    const createdAt = new Date('2026-05-19T10:00:00.000Z');
    const id1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const id2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const hmac1 = service.computeHmac(id1, 'user.login', null, null, null, null, createdAt);
    const hmac2 = service.computeHmac(id2, 'node.assigned', null, null, null, null, createdAt);

    const { service: svc2 } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findMany: jest.fn().mockResolvedValue([
          { id: id1, action: 'user.login',    entityType: null, entityId: null, tenantId: null, userId: null, createdAt, hmac: hmac1 },
          { id: id2, action: 'node.assigned', entityType: null, entityId: null, tenantId: null, userId: null, createdAt, hmac: hmac2 },
        ]),
      },
    });

    const start = new Date('2026-05-19T00:00:00.000Z');
    const end   = new Date('2026-05-19T23:59:59.000Z');
    const result = await svc2.verifyRange(start, end);

    expect(result.total).toBe(2);
    expect(result.verified).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.legacy).toBe(0);
  });

  it('separa logs legacy (hmac vacío) de los verificados', async () => {
    const { service } = makeService();
    const createdAt = new Date('2026-05-19T10:00:00.000Z');
    const id1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const hmac1 = service.computeHmac(id1, 'user.login', null, null, null, null, createdAt);

    const { service: svc2 } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findMany: jest.fn().mockResolvedValue([
          { id: id1, action: 'user.login', entityType: null, entityId: null, tenantId: null, userId: null, createdAt, hmac: hmac1 },
          { id: 'legacy-id', action: 'old.action', entityType: null, entityId: null, tenantId: null, userId: null, createdAt, hmac: '' },
        ]),
      },
    });

    const result = await svc2.verifyRange(new Date(), new Date());

    expect(result.total).toBe(2);
    expect(result.verified).toBe(1);
    expect(result.legacy).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('identifica IDs de logs manipulados', async () => {
    const createdAt = new Date('2026-05-19T10:00:00.000Z');
    const id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const wrongHmac = 'a'.repeat(64);

    const { service: svc2 } = makeService({
      auditLog: {
        ...makePrisma().auditLog,
        findMany: jest.fn().mockResolvedValue([
          { id, action: 'user.login', entityType: null, entityId: null, tenantId: null, userId: null, createdAt, hmac: wrongHmac },
        ]),
      },
    });

    const result = await svc2.verifyRange(new Date(), new Date());

    expect(result.failed).toBe(1);
    expect(result.failedIds).toContain(id);
  });
});
