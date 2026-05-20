import { Test } from '@nestjs/testing';
import { PrismaConfigDataProvider } from './prisma-config-data.provider';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  domain: { findMany: jest.fn() },
  mailbox: { findMany: jest.fn() },
  alias: { findMany: jest.fn() },
};

describe('PrismaConfigDataProvider', () => {
  let provider: PrismaConfigDataProvider;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PrismaConfigDataProvider,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    provider = module.get(PrismaConfigDataProvider);
  });

  // ─── getDomainsByNodeId ─────────────────────────────────────────────────────

  describe('getDomainsByNodeId()', () => {
    it('consulta dominios ACTIVE del nodeId y los mapea correctamente', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([
        {
          id: 'd1',
          tenantId: 't1',
          domain: 'example.com',
          dkimSelector: 'mail',
          dkimPublicKey: 'pubkey-abc',
          dkimPrivateKeyEncrypted: 'enc-key-xyz',
          status: 'ACTIVE',
        },
      ]);

      const result = await provider.getDomainsByNodeId('node-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'd1',
        tenantId: 't1',
        domain: 'example.com',
        dkimSelector: 'mail',
        dkimPublicKey: 'pubkey-abc',
        dkimPrivateKeyEncrypted: 'enc-key-xyz',
        status: 'ACTIVE',
      });
      expect(mockPrisma.domain.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { nodeId: 'node-1', status: 'ACTIVE' },
        }),
      );
    });

    it('retorna array vacío si no hay dominios en el nodo', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([]);

      const result = await provider.getDomainsByNodeId('node-empty');

      expect(result).toEqual([]);
    });

    it('maneja múltiples dominios en el mismo nodo', async () => {
      mockPrisma.domain.findMany.mockResolvedValue([
        { id: 'd1', tenantId: 't1', domain: 'alpha.com', dkimSelector: 's1', dkimPublicKey: 'p1', dkimPrivateKeyEncrypted: 'e1', status: 'ACTIVE' },
        { id: 'd2', tenantId: 't2', domain: 'beta.com', dkimSelector: 's2', dkimPublicKey: 'p2', dkimPrivateKeyEncrypted: 'e2', status: 'ACTIVE' },
      ]);

      const result = await provider.getDomainsByNodeId('node-multi');

      expect(result).toHaveLength(2);
      expect(result.map((d) => d.domain)).toEqual(['alpha.com', 'beta.com']);
    });
  });

  // ─── getMailboxesByNodeId ───────────────────────────────────────────────────

  describe('getMailboxesByNodeId()', () => {
    it('retorna buzones mapeados incluyendo el nombre de dominio anidado', async () => {
      mockPrisma.mailbox.findMany.mockResolvedValue([
        {
          id: 'm1',
          tenantId: 't1',
          domainId: 'd1',
          localPart: 'alice',
          passwordHash: '$2b$10$hash',
          status: 'ACTIVE',
          quotaBytes: 1_073_741_824,
          domain: { domain: 'example.com' },
        },
      ]);

      const result = await provider.getMailboxesByNodeId('node-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'm1',
        tenantId: 't1',
        domainId: 'd1',
        localPart: 'alice',
        domain: 'example.com',
        passwordHash: '$2b$10$hash',
        status: 'ACTIVE',
        quotaBytes: 1_073_741_824,
      });
      expect(mockPrisma.mailbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            domain: { nodeId: 'node-1', status: 'ACTIVE' },
          },
        }),
      );
    });

    it('retorna array vacío si no hay buzones activos en el nodo', async () => {
      mockPrisma.mailbox.findMany.mockResolvedValue([]);

      const result = await provider.getMailboxesByNodeId('node-empty');

      expect(result).toEqual([]);
    });

    it('maneja múltiples buzones de distintos dominios', async () => {
      mockPrisma.mailbox.findMany.mockResolvedValue([
        { id: 'm1', tenantId: 't1', domainId: 'd1', localPart: 'alice', passwordHash: 'h1', status: 'ACTIVE', quotaBytes: 0, domain: { domain: 'alpha.com' } },
        { id: 'm2', tenantId: 't2', domainId: 'd2', localPart: 'bob', passwordHash: 'h2', status: 'ACTIVE', quotaBytes: 512, domain: { domain: 'beta.com' } },
      ]);

      const result = await provider.getMailboxesByNodeId('node-multi');

      expect(result).toHaveLength(2);
      expect(result[0].domain).toBe('alpha.com');
      expect(result[1].domain).toBe('beta.com');
    });
  });

  // ─── getAliasesByNodeId ─────────────────────────────────────────────────────

  describe('getAliasesByNodeId()', () => {
    it('retorna alias mapeados correctamente', async () => {
      mockPrisma.alias.findMany.mockResolvedValue([
        {
          id: 'a1',
          tenantId: 't1',
          source: 'info@example.com',
          destination: 'alice@example.com',
          active: true,
        },
      ]);

      const result = await provider.getAliasesByNodeId('node-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'a1',
        tenantId: 't1',
        source: 'info@example.com',
        destination: 'alice@example.com',
        active: true,
      });
      expect(mockPrisma.alias.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            domain: { nodeId: 'node-1', status: 'ACTIVE' },
          },
        }),
      );
    });

    it('retorna array vacío si no hay alias activos', async () => {
      mockPrisma.alias.findMany.mockResolvedValue([]);

      const result = await provider.getAliasesByNodeId('node-empty');

      expect(result).toEqual([]);
    });

    it('maneja múltiples alias en el mismo nodo', async () => {
      mockPrisma.alias.findMany.mockResolvedValue([
        { id: 'a1', tenantId: 't1', source: 'info@alpha.com', destination: 'team@alpha.com', active: true },
        { id: 'a2', tenantId: 't1', source: 'support@alpha.com', destination: 'team@alpha.com', active: true },
      ]);

      const result = await provider.getAliasesByNodeId('node-multi');

      expect(result).toHaveLength(2);
      expect(result[0].source).toBe('info@alpha.com');
      expect(result[1].source).toBe('support@alpha.com');
    });
  });
});
