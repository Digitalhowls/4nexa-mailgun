import { UnauthorizedException, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
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
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    it('establece lockedUntil al alcanzar 5 intentos fallidos (cubre línea 70)', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'x@x.com',
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 4,
        totpEnabled: false,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$aaaa$bbbb',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        authService.login({ email: 'x@x.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lockedUntil: expect.any(Date) }),
        }),
      );
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

    it('crea y devuelve el usuario correctamente', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'new-id', email: 'new@x.com' });

      const result = await authService.register({
        email: 'new@x.com',
        password: 'Password1!',
        role: UserRole.TENANT_OWNER,
      });

      expect(result).toEqual({ id: 'new-id', email: 'new@x.com' });
    });
  });

  // ─── login() éxito ────────────────────────────────────────────────────────

  describe('login() — éxito', () => {
    it('devuelve tokens si las credenciales son correctas', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        totpEnabled: false,
        passwordHash: '$argon2id$hash',
        role: 'TENANT_OWNER',
        tenantId: 't1',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await authService.login({ email: 'user@test.com', password: 'pass' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(900);
    });

    it('lanza UnauthorizedException si el código TOTP está ausente', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        totpEnabled: true,
        totpSecret: 'BASE32SECRET',
        passwordHash: '$argon2id$hash',
        role: 'TENANT_OWNER',
        tenantId: null,
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(
        authService.login({ email: 'user@test.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el código TOTP es incorrecto (líneas 83-85)', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        status: 'ACTIVE',
        lockedUntil: null,
        failedLoginAttempts: 0,
        totpEnabled: true,
        totpSecret: 'BASE32SECRET',
        passwordHash: '$argon2id$hash',
        role: 'TENANT_OWNER',
        tenantId: null,
      });
      jest.spyOn(authService, 'verifyTotp').mockReturnValue(false);

      await expect(
        authService.login({ email: 'user@test.com', password: 'pass', totpCode: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout() ────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('revoca el refresh token del jti indicado', async () => {
      const { authService, prisma } = makeDeps();
      await authService.logout('jti-1234');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-1234', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // ─── getMe() ─────────────────────────────────────────────────────────────

  describe('getMe()', () => {
    it('devuelve los datos del usuario', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'u@x.com',
        role: 'TENANT_OWNER',
        tenantId: 't1',
      });

      const result = await authService.getMe('u1');
      expect(result).toMatchObject({ id: 'u1', email: 'u@x.com' });
    });

    it('lanza NotFoundException si no existe el usuario', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.getMe('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── changePassword() ────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('lanza NotFoundException si no existe el usuario', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.changePassword('u1', 'old', 'new')).rejects.toThrow(NotFoundException);
    });

    it('lanza UnauthorizedException si la contraseña actual es incorrecta', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        passwordHash: '$argon2id$hash',
      });
      // argon2.verify sigue mockeado a false por defecto

      await expect(authService.changePassword('u1', 'wrongOld', 'newPass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('actualiza la contraseña cuando es correcta', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);

      const { authService, prisma } = makeDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        passwordHash: '$argon2id$hash',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await expect(authService.changePassword('u1', 'correctOld', 'newPass')).resolves.not.toThrow();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });
  });

  // ─── refreshTokens() ─────────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    it('lanza UnauthorizedException si el token JWT es inválido', async () => {
      const { authService } = makeDeps();
      await expect(authService.refreshTokens('invalid-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el token está revocado', async () => {
      const payload = {
        sub: 'u1',
        email: 'u@x.com',
        role: 'TENANT_OWNER',
        tenantId: null,
        jti: 'jti-abc',
        iat: 1,
        exp: 9999999999,
      };
      const { authService, prisma, jwtService } = makeDeps();
      (jwtService as any).verify = jest.fn().mockReturnValue(payload);
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        user: { id: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null },
      });

      await expect(authService.refreshTokens('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el token no se encuentra', async () => {
      const payload = {
        sub: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null,
        jti: 'jti-notfound', iat: 1, exp: 9999999999,
      };
      const { authService, prisma, jwtService } = makeDeps();
      (jwtService as any).verify = jest.fn().mockReturnValue(payload);
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.refreshTokens('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('devuelve nuevos tokens en rotación exitosa', async () => {
      const payload = {
        sub: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null,
        jti: 'jti-ok', iat: 1, exp: 9999999999,
      };
      const { authService, prisma, jwtService } = makeDeps();
      (jwtService as any).verify = jest.fn().mockReturnValue(payload);
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        user: { id: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null },
      });

      const result = await authService.refreshTokens('valid-token');
      expect(result).toHaveProperty('accessToken');
    });

    it('lanza UnauthorizedException si el token está expirado (línea 166)', async () => {
      const payload = {
        sub: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null,
        jti: 'jti-expired', iat: 1, exp: 9999999999,
      };
      const { authService, prisma, jwtService } = makeDeps();
      (jwtService as any).verify = jest.fn().mockReturnValue(payload);
      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'rt-exp',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // ya expirado
        user: { id: 'u1', email: 'u@x.com', role: 'TENANT_OWNER', tenantId: null },
      });

      await expect(authService.refreshTokens('valid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── TOTP ─────────────────────────────────────────────────────────────────

  describe('generateTotpSecret()', () => {
    it('devuelve un secreto y URI válidos', () => {
      const { authService } = makeDeps();
      const result = authService.generateTotpSecret();
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('uri');
      expect(result.uri).toContain('otpauth://totp/');
    });
  });

  describe('enableTotp()', () => {
    it('lanza UnauthorizedException si el código TOTP es inválido', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      // Base32 válido pero código incorrecto → verifyTotp devuelve false
      const { secret } = authService.generateTotpSecret();

      await expect(authService.enableTotp('u1', secret, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('habilita TOTP cuando el código es válido (línea 260)', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      jest.spyOn(authService, 'verifyTotp').mockReturnValue(true);

      await authService.enableTotp('u1', 'SOMESECRET', '123456');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { totpSecret: 'SOMESECRET', totpEnabled: true } }),
      );
    });
  });

  describe('disableTotp()', () => {
    it('deshabilita TOTP del usuario', async () => {
      const { authService, prisma } = makeDeps();
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      await authService.disableTotp('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { totpSecret: null, totpEnabled: false },
      });
    });
  });
});