import { NotFoundException } from '@nestjs/common';
import { AntispamService } from './antispam.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOMAIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const POLICY_FIXTURE = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  domainId: DOMAIN_ID,
  enabled: true,
  spamThreshold: 0.80,
  rejectAbove: 0.95,
  greylistEnabled: false,
  whitelist: ['trusted@example.com'],
  blacklist: ['spam@evil.com', 'evil.com'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makePrisma({
  domain = { id: DOMAIN_ID, tenantId: TENANT_ID, deletedAt: null },
  policy = POLICY_FIXTURE as typeof POLICY_FIXTURE | null,
  mailEventCount = 0,
} = {}) {
  return {
    domain: {
      findUnique: jest.fn().mockResolvedValue(domain),
    },
    antispamPolicy: {
      upsert:     jest.fn().mockResolvedValue(policy ?? POLICY_FIXTURE),
      findUnique: jest.fn().mockResolvedValue(policy),
      delete:     jest.fn().mockResolvedValue(policy ?? POLICY_FIXTURE),
    },
    mailEvent: {
      count: jest.fn().mockResolvedValue(mailEventCount),
    },
  };
}

function makeService(opts?: Parameters<typeof makePrisma>[0]) {
  return new AntispamService(makePrisma(opts) as any, makeAudit() as any);
}

// ─── upsertPolicy() ───────────────────────────────────────────────────────────

describe('upsertPolicy()', () => {
  it('lanza NotFoundException si el dominio no existe', async () => {
    const svc = makeService({ domain: null as any });
    await expect(
      svc.upsertPolicy(DOMAIN_ID, { enabled: true, spamThreshold: 0.8, rejectAbove: 0.95, greylistEnabled: false, whitelist: [], blacklist: [] }),
    ).rejects.toThrow('no encontrado');
  });

  it('llama a prisma.antispamPolicy.upsert con los parámetros correctos', async () => {
    const prisma = makePrisma();
    const svc = new AntispamService(prisma as any, makeAudit() as any);

    await svc.upsertPolicy(DOMAIN_ID, {
      enabled: true,
      spamThreshold: 0.75,
      rejectAbove: 0.90,
      greylistEnabled: true,
      whitelist: ['safe@good.com'],
      blacklist: [],
    });

    expect(prisma.antispamPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domainId: DOMAIN_ID },
        create: expect.objectContaining({ spamThreshold: 0.75, rejectAbove: 0.90 }),
        update: expect.objectContaining({ spamThreshold: 0.75, rejectAbove: 0.90 }),
      }),
    );
  });

  it('registra acción en audit log', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new AntispamService(prisma as any, audit as any);

    await svc.upsertPolicy(DOMAIN_ID, {
      enabled: true, spamThreshold: 0.8, rejectAbove: 0.95, greylistEnabled: false, whitelist: [], blacklist: [],
    }, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'antispam.policy_upserted', entityId: DOMAIN_ID }),
    );
  });
});

// ─── getPolicy() ─────────────────────────────────────────────────────────────

describe('getPolicy()', () => {
  it('devuelve la política si existe', async () => {
    const svc = makeService();
    const result = await svc.getPolicy(DOMAIN_ID);
    expect(result.exists).toBe(true);
    expect((result as any).domainId).toBe(DOMAIN_ID);
  });

  it('devuelve defaults si no existe política', async () => {
    const svc = makeService({ policy: null });
    const result = await svc.getPolicy(DOMAIN_ID);
    expect(result.exists).toBe(false);
    expect((result as any).defaults.spamThreshold).toBe(0.80);
  });

  it('lanza NotFoundException si el dominio no existe', async () => {
    const svc = makeService({ domain: null as any });
    await expect(svc.getPolicy(DOMAIN_ID)).rejects.toThrow('no encontrado');
  });
});

// ─── evaluateMessage() ────────────────────────────────────────────────────────

describe('evaluateMessage()', () => {
  it('devuelve ACCEPT con reason=no_policy si no hay política', async () => {
    const svc = makeService({ policy: null });
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'any@example.com', spamScore: 0.9 });
    expect(result.action).toBe('ACCEPT');
    expect(result.reason).toBe('no_policy');
  });

  it('devuelve ACCEPT con reason=whitelisted para remitentes en whitelist', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'trusted@example.com', spamScore: 0.99 });
    expect(result.action).toBe('ACCEPT');
    expect(result.reason).toBe('whitelisted');
  });

  it('devuelve REJECT con reason=blacklisted para remitentes en blacklist (email)', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'spam@evil.com', spamScore: 0 });
    expect(result.action).toBe('REJECT');
    expect(result.reason).toBe('blacklisted');
  });

  it('devuelve REJECT con reason=blacklisted para dominios en blacklist', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'any@evil.com', spamScore: 0 });
    expect(result.action).toBe('REJECT');
    expect(result.reason).toBe('blacklisted');
  });

  it('devuelve REJECT cuando score ≥ rejectAbove', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'user@other.com', spamScore: 0.96 });
    expect(result.action).toBe('REJECT');
  });

  it('devuelve FLAG cuando score ≥ spamThreshold y < rejectAbove', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'user@other.com', spamScore: 0.85 });
    expect(result.action).toBe('FLAG');
  });

  it('devuelve ACCEPT cuando score < spamThreshold', async () => {
    const svc = makeService();
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'user@other.com', spamScore: 0.30 });
    expect(result.action).toBe('ACCEPT');
    expect(result.reason).toBe('below_threshold');
  });

  it('devuelve GREYLISTED para remitente nuevo con greylisting activo', async () => {
    const greylistPolicy = { ...POLICY_FIXTURE, greylistEnabled: true };
    const prisma = makePrisma({ policy: greylistPolicy, mailEventCount: 0 });
    const svc = new AntispamService(prisma as any, makeAudit() as any);
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'new@unknown.com', spamScore: 0.1 });
    expect(result.action).toBe('GREYLISTED');
  });

  it('no greylista remitente conocido (ya tiene eventos previos)', async () => {
    const greylistPolicy = { ...POLICY_FIXTURE, greylistEnabled: true };
    const prisma = makePrisma({ policy: greylistPolicy, mailEventCount: 3 });
    const svc = new AntispamService(prisma as any, makeAudit() as any);
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'known@safe.com', spamScore: 0.1 });
    expect(result.action).toBe('ACCEPT');
  });

  it('usa spamScore=0 por defecto cuando no se pasa (cubre ?? 0 en no_policy, línea 138)', async () => {
    const svc = makeService({ policy: null });
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'any@example.com' });
    expect(result.action).toBe('ACCEPT');
    expect(result.score).toBe(0);
  });

  it('senderDomain es cadena vacía cuando email no tiene @ (cubre ?? \'\' en línea 142)', async () => {
    const svc = makeService();
    // sin @ → senderDomain = ''
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'sinArroba', spamScore: 0.2 });
    expect(result.action).toBe('ACCEPT');
  });

  it('usa spamScore=0 por defecto con política activa y sin spamScore (cubre default-arg línea 141)', async () => {
    const svc = makeService(); // POLICY_FIXTURE habilitado
    const result = await svc.evaluateMessage(DOMAIN_ID, { senderEmail: 'user@other.com' } as any);
    expect(result.action).toBe('ACCEPT');
    expect(result.score).toBe(0);
  });
});

// ─── deletePolicy() ──────────────────────────────────────────────────────────

describe('deletePolicy()', () => {
  it('lanza NotFoundException si no existe la política', async () => {
    const svc = makeService({ policy: null });
    await expect(svc.deletePolicy(DOMAIN_ID)).rejects.toThrow(NotFoundException);
  });

  it('retorna deleted:true y audita cuando la política existe', async () => {
    const audit = makeAudit();
    const prisma = makePrisma();
    const svc = new AntispamService(prisma as any, audit as any);

    const result = await svc.deletePolicy(DOMAIN_ID, 'user-1');

    expect(result).toEqual({ deleted: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'antispam.policy_deleted' }),
    );
  });

  it('audita con tenantId undefined cuando el dominio no se encuentra tras borrar (rama domain?.tenantId)', async () => {
    const audit = makeAudit();
    const prisma = makePrisma({ domain: null as any });
    const svc = new AntispamService(prisma as any, audit as any);

    const result = await svc.deletePolicy(DOMAIN_ID);

    expect(result).toEqual({ deleted: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
    );
  });
});
