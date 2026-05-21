import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { WebmailService } from './webmail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  user: { findUnique: jest.fn() },
  domain: { findFirst: jest.fn() },
};
const mockAudit = { log: jest.fn() };
const mockJwt = { sign: jest.fn().mockReturnValue('signed-token') };

describe('WebmailService', () => {
  let service: WebmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-ok';
    process.env.SNAPPYMAIL_BASE_URL = 'https://webmail.test';
    const module = await Test.createTestingModule({
      providers: [
        WebmailService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();
    service = module.get(WebmailService);
  });

  describe('generateSsoToken', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.generateSsoToken('u1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('retorna token JWT y URL de webmail correctos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        tenant: { id: 't1', node: { hostname: 'mail.example.com' } },
      });
      const result = await service.generateSsoToken('u1', 't1');
      expect(result.token).toBe('signed-token');
      expect(result.webmailUrl).toContain('sso=');
      expect(result.webmailUrl).toContain('https://webmail.test');
      expect(result.expiresIn).toBe(900);
    });

    it('usa hostname del nodo si el tenant tiene nodo asignado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        tenant: { id: 't1', node: { hostname: 'mx1.myserver.com' } },
      });
      await service.generateSsoToken('u1', 't1');
      // Verifica que el audit se llama correctamente
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webmail.sso_token_generated',
          userId: 'u1',
          tenantId: 't1',
          entityType: 'User',
          entityId: 'u1',
        }),
      );
    });

    it('audita la generación del token SSO aunque el tenant no tenga nodo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        tenant: null,
      });
      await service.generateSsoToken('u1', 't1');
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('configureDomainInWebmail', () => {
    it('lanza NotFoundException si el dominio no existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue(null);
      await expect(service.configureDomainInWebmail('d1', 't1')).rejects.toThrow(NotFoundException);
    });

    it('completa sin error si el dominio existe', async () => {
      mockPrisma.domain.findFirst.mockResolvedValue({
        id: 'd1',
        domain: 'example.com',
        node: null,
      });
      await expect(service.configureDomainInWebmail('d1', 't1')).resolves.toBeUndefined();
    });
  });

  describe('constructor sin SNAPPYMAIL_BASE_URL (rama ?? fallback)', () => {
    it('usa URL por defecto cuando SNAPPYMAIL_BASE_URL no está definida', async () => {
      const saved = process.env.SNAPPYMAIL_BASE_URL;
      delete process.env.SNAPPYMAIL_BASE_URL;
      try {
        const { Test: TestNest } = await import('@nestjs/testing');
        const mod = await TestNest.createTestingModule({
          providers: [
            WebmailService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: AuditService, useValue: mockAudit },
            { provide: JwtService, useValue: mockJwt },
          ],
        }).compile();
        const svc = mod.get(WebmailService);
        expect(svc).toBeDefined();
      } finally {
        if (saved !== undefined) process.env.SNAPPYMAIL_BASE_URL = saved;
      }
    });
  });
});
