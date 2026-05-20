import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@4nexa/types';

// Mock argon2 para evitar ejecutar hashing real en tests unitarios
jest.mock('argon2', () => ({
  argon2id: 2,
  verify: jest.fn().mockResolvedValue(false),  // contraseña siempre incorrecta por defecto
  hash: jest.fn().mockResolvedValue('$argon2id$mocked-hash'),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(overrides: Partial<Record<string, jest.Mock>> = {}): PrismaService {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaService;
}

function makeDeps(prismaOverrides: Partial<Record<string, jest.Mock>> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const jwtService = {
    sign: jest.fn().mockReturnValue('access-token'),
    signAsync: jest.fn().mockResolvedValue('access-token'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const config = {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        JWT_ACCESS_SECRET: 'access-secret-minimum-32-chars-ok!',
        JWT_REFRESH_SECRET: 'refresh-secret-minimum-32-chars!!',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        DKIM_ENCRYPTION_KEY: 'dkim-key-minimum-32-chars-test!!',
      };
      return map[key];
    },
  } as unknown as ConfigService<any, true>;
  const authService = new AuthService(prisma, jwtService, config);
  return { prisma, jwtService, authService };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  // ─── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('lanza UnauthorizedException si el usuario no existe', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza ForbiddenException si el usuario está SUSPENDED', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'x@x.com',
        status: 'SUSPENDED',
        lockedUntil: null,
        failedLoginAttempts: 0,
        totpEnabled: false,
        passwordHash: '$argon2id$...',
      });

      await expect(authService.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza UnauthorizedException si la cuenta está bloqueada temporalmente', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'x@x.com',
        status: 'ACTIVE',
        lockedUntil: new Date(Date.now() + 60_000), // bloqueado 1 min
        failedLoginAttempts: 5,
        totpEnabled: false,
        passwordHash: '$argon2id$...',
      });

      await expect(authService.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const { authService, prisma } = makeDeps();
      // Hash real de "correct-password" (no coincidirá con "wrong-password")
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'x@x.com',
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        totpEnabled: false,
        // hash argon2id que nunca coincidirá con "wrong-password"
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$aaaa$bbbb',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        authService.login({ email: 'x@x.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── register() / createUser() ────────────────────────────────────────────

  describe('register()', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        authService.register({
          email: 'existing@x.com',
          password: 'Password1!',
          role: UserRole.TENANT_OWNER,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
