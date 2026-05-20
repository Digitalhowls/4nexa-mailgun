import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Server } from 'http';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserRole } from '@4nexa/types';

// ─── Mock argon2 ─────────────────────────────────────────────────────────────
jest.mock('argon2', () => ({
  argon2id: 2,
  verify: jest.fn().mockResolvedValue(false),
  hash: jest.fn().mockResolvedValue('$argon2id$mocked-hash'),
}));

// ─── Constantes ──────────────────────────────────────────────────────────────

const JWT_ACCESS_SECRET = 'access-secret-minimum-32-chars-ok!';
const JWT_REFRESH_SECRET = 'refresh-secret-minimum-32-chars!!';

const ENV_MAP: Record<string, unknown> = {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  DKIM_ENCRYPTION_KEY: 'dkim-test-key-minimum-32-chars!!',
  LOG_LEVEL: 'error',
};

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('AuthController (integración HTTP)', () => {
  let app: INestApplication;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const auditMock = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        JwtModule.register({ secret: JWT_ACCESS_SECRET }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => ENV_MAP[k] } as unknown as ConfigService<any, true>,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = {
            sub: 'admin-id',
            email: 'admin@4nexa.io',
            role: UserRole.SUPER_ADMIN,
            tenantId: null,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 900,
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prismaMock.auditLog!.create as jest.Mock).mockResolvedValue({});
    (auditMock.log as jest.Mock).mockResolvedValue(undefined);
  });

  // ─── POST /auth/login ───────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('→ 400 si el body está vacío', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({});
      expect(res.status).toBe(400);
    });

    it('→ 401 si el usuario no existe', async () => {
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password1!' });
      expect(res.status).toBe(401);
    });

    it('→ 401 si la cuenta está bloqueada', async () => {
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        status: 'ACTIVE',
        lockedUntil: new Date(Date.now() + 60_000),
        failedLoginAttempts: 5,
        totpEnabled: false,
        passwordHash: '$argon2id$...',
      });
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'Password1!' });
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /auth/register ────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('→ 400 si faltan campos requeridos', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'bad' }); // sin password ni role
      expect(res.status).toBe(400);
    });

    it('→ 409 si el email ya existe', async () => {
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'existing@x.com', password: 'Password12!@', role: UserRole.TENANT_OWNER });
      expect(res.status).toBe(409);
    });

    it('→ 201 registro exitoso', async () => {
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaMock.user!.create as jest.Mock).mockResolvedValue({
        id: 'new-user-id',
        email: 'new@test.com',
      });
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/register')
        .send({ email: 'new@test.com', password: 'Password12!@', role: UserRole.TENANT_OWNER });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /auth/login éxito ─────────────────────────────────────────────

  describe('POST /auth/login — ruta de éxito', () => {
    it('→ 200 con credenciales correctas', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
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
      (prismaMock.user!.update as jest.Mock).mockResolvedValue({});
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'user@test.com', password: 'Password1!' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── GET /auth/me ───────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('→ 200 con datos del usuario autenticado', async () => {
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'admin-id',
        email: 'admin@4nexa.io',
        role: 'SUPER_ADMIN',
        tenantId: null,
      });
      const res = await request(app.getHttpServer() as Server)
        .get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /auth/logout ──────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('→ 200 cierra sesión correctamente', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/logout')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /auth/totp/setup ──────────────────────────────────────────────

  describe('POST /auth/totp/setup', () => {
    it('→ 200 retorna secreto TOTP', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/totp/setup')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── POST /auth/change-password ────────────────────────────────────────

  describe('POST /auth/change-password', () => {
    it('→ 200 contraseña cambiada correctamente', async () => {
      const argon2Mock = jest.requireMock<{ verify: jest.Mock }>('argon2');
      argon2Mock.verify.mockResolvedValueOnce(true);
      (prismaMock.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'admin-id',
        passwordHash: '$argon2id$hash',
      });
      (prismaMock.user!.update as jest.Mock).mockResolvedValue({});
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/change-password')
        .set('Authorization', 'Bearer token')
        .send({
          currentPassword: 'OldPass1!',
          newPassword: 'NewPass12!abc',
          confirmPassword: 'NewPass12!abc',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
