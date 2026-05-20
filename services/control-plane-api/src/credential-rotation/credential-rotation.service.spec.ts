import { CredentialRotationService } from './credential-rotation.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DKIM_KEY = 'test-dkim-encryption-key-32chars!';

function makeConfig() {
  return { get: jest.fn().mockReturnValue(DKIM_KEY) };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makeEventBus() {
  return { publish: jest.fn().mockResolvedValue(undefined) };
}

const DOMAIN_FIXTURE = {
  id:       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  domain:   'example.com',
  dkimSelector: '4nexa',
  deletedAt: null,
};

function makePrisma(domainOverride?: Partial<typeof DOMAIN_FIXTURE> | null) {
  const domain =
    domainOverride === null
      ? null
      : { ...DOMAIN_FIXTURE, ...domainOverride };

  const updated = domain
    ? {
        ...domain,
        dkimPublicKey: 'pubkey-updated',
        updatedAt: new Date('2026-05-20T10:00:00.000Z'),
      }
    : null;

  return {
    domain: {
      findUnique: jest.fn().mockResolvedValue(domain),
      update:     jest.fn().mockResolvedValue(updated),
    },
  };
}

function makeService(prismaOverride = makePrisma()) {
  return new CredentialRotationService(
    prismaOverride as any,
    makeConfig() as any,
    makeEventBus() as any,
    makeAudit() as any,
  );
}

// ─── generateDkimKeyPair() ────────────────────────────────────────────────────

describe('generateDkimKeyPair()', () => {
  it('devuelve publicKeyBase64 y encryptedPrivateKey no vacíos', async () => {
    const svc = makeService();
    const result = await svc.generateDkimKeyPair();
    expect(result.publicKeyBase64.length).toBeGreaterThan(100);
    expect(result.encryptedPrivateKey).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('cada llamada genera claves distintas', async () => {
    const svc = makeService();
    const a = await svc.generateDkimKeyPair();
    const b = await svc.generateDkimKeyPair();
    expect(a.publicKeyBase64).not.toBe(b.publicKeyBase64);
    expect(a.encryptedPrivateKey).not.toBe(b.encryptedPrivateKey);
  });
});

// ─── rotateDkim() ─────────────────────────────────────────────────────────────

describe('rotateDkim()', () => {
  it('lanza NotFoundException si el dominio no existe', async () => {
    const prisma = makePrisma(null);
    const svc = makeService(prisma);
    await expect(svc.rotateDkim('bad-id', {})).rejects.toThrow('no encontrado');
  });

  it('usa el selector proporcionado cuando se indica', async () => {
    const prisma = makePrisma();
    const eventBus = makeEventBus();
    const svc = new CredentialRotationService(
      prisma as any, makeConfig() as any, eventBus as any, makeAudit() as any,
    );

    await svc.rotateDkim(DOMAIN_FIXTURE.id, { newSelector: 'my-selector' });

    expect(prisma.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dkimSelector: 'my-selector' }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'credentials.rotated', newSelector: 'my-selector' }),
    );
  });

  it('autogenera selector con prefijo 4nexa- cuando no se proporciona', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.rotateDkim(DOMAIN_FIXTURE.id, {});

    const updateCall = (prisma.domain.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.dkimSelector).toMatch(/^4nexa-\d+$/);
  });

  it('guarda nuevas claves DKIM en prisma', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.rotateDkim(DOMAIN_FIXTURE.id, {});

    expect(prisma.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOMAIN_FIXTURE.id },
        data: expect.objectContaining({
          dkimPublicKey: expect.any(String),
          dkimPrivateKeyEncrypted: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/),
        }),
      }),
    );
  });

  it('publica evento credentials.rotated en el bus', async () => {
    const prisma = makePrisma();
    const eventBus = makeEventBus();
    const svc = new CredentialRotationService(
      prisma as any, makeConfig() as any, eventBus as any, makeAudit() as any,
    );

    await svc.rotateDkim(DOMAIN_FIXTURE.id, {}, 'user-999');

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'credentials.rotated', domainId: DOMAIN_FIXTURE.id }),
    );
  });

  it('registra la acción en el audit log', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new CredentialRotationService(
      prisma as any, makeConfig() as any, makeEventBus() as any, audit as any,
    );

    await svc.rotateDkim(DOMAIN_FIXTURE.id, {}, 'user-42');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'credentials.rotated',
        entityType: 'domain',
        entityId: DOMAIN_FIXTURE.id,
        userId: 'user-42',
      }),
    );
  });

  it('devuelve domainId, newSelector, dkimPublicKey y updatedAt', async () => {
    const svc = makeService();
    const result = await svc.rotateDkim(DOMAIN_FIXTURE.id, { newSelector: 'sel-v2' });

    expect(result.domainId).toBe(DOMAIN_FIXTURE.id);
    expect(result.newSelector).toBe('sel-v2');
    expect(result.dkimPublicKey).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });
});

// ─── getDkimStatus() ──────────────────────────────────────────────────────────

describe('getDkimStatus()', () => {
  it('lanza NotFoundException si el dominio no existe', async () => {
    const svc = makeService(makePrisma(null));
    await expect(svc.getDkimStatus('bad-id')).rejects.toThrow('no encontrado');
  });

  it('devuelve selector, publicKey y dnsRecord correctos', async () => {
    const prisma = {
      domain: {
        findUnique: jest.fn().mockResolvedValue({
          ...DOMAIN_FIXTURE,
          dkimPublicKey: 'base64pubkey',
          updatedAt: new Date(),
        }),
        update: jest.fn(),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.getDkimStatus(DOMAIN_FIXTURE.id);

    expect(result.selector).toBe('4nexa');
    expect(result.publicKey).toBe('base64pubkey');
    expect(result.dnsRecord).toBe('4nexa._domainkey.example.com');
  });
});
