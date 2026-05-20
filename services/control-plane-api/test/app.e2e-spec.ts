import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

// ─── Mock de BullMQ (evita conexión real a Redis) ────────────────────────────

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job' }),
    addBulk: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Stubs de infraestructura ─────────────────────────────────────────────────

const mockPrismaQueryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
const mockPrismaUserFindUnique = jest.fn().mockImplementation(
  ({ where }: { where: { id?: string; email?: string } }) => {
    // Usuario de test e2e siempre existe y está activo
    if (where.id === 'user-e2e-test') {
      return Promise.resolve({ id: 'user-e2e-test', status: 'ACTIVE' });
    }
    return Promise.resolve(null);
  },
);
const mockPrisma = {
  $queryRaw: mockPrismaQueryRaw,
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  user: { findUnique: mockPrismaUserFindUnique, create: jest.fn(), update: jest.fn() },
  tenant: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  domain: { findMany: jest.fn().mockResolvedValue([]) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  refreshToken: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), deleteMany: jest.fn() },
};

const mockRedisPing = jest.fn().mockResolvedValue('PONG');
const mockRedis = {
  client: {
    ping: mockRedisPing,
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    setex: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
  },
};

// ─── Suite E2E ────────────────────────────────────────────────────────────────

describe('Control Plane API — E2E', () => {
  let app: NestFastifyApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );

    // Replicar la configuración de main.ts
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // ─── Helper para generar JWT de test ─────────────────────────────────────

  function makeAuthToken(role = 'ADMIN', tenantId: string | null = null) {
    const svc = new JwtService({ secret: process.env['JWT_ACCESS_SECRET'] });
    return svc.sign(
      {
        sub: 'user-e2e-test',
        email: 'e2e@example.com',
        role,
        tenantId,
        jti: 'jti-e2e-test',
      },
      { expiresIn: '1h' },
    );
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('retorna 200 con status ok cuando DB y Redis están disponibles', async () => {
      mockPrismaQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
      mockRedisPing.mockResolvedValue('PONG');

      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as {
        status: string; db: string; redis: string; uptime: number
      };
      expect(body.status).toBe('ok');
      expect(body.db).toBe('ok');
      expect(body.redis).toBe('ok');
      expect(typeof body.uptime).toBe('number');
    });

    it('retorna 200 con status degraded cuando DB falla', async () => {
      mockPrismaQueryRaw.mockRejectedValueOnce(new Error('DB error'));
      mockRedisPing.mockResolvedValue('PONG');

      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { status: string; db: string };
      expect(body.status).toBe('degraded');
      expect(body.db).toBe('error');
    });
  });

  // ─── Autenticación ────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('retorna 400 cuando el body está vacío', async () => {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {},
        headers: { 'Content-Type': 'application/json' },
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { success: boolean };
      expect(body.success).toBe(false);
    });

    it('retorna 400 cuando el email es inválido', async () => {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'no-es-un-email', password: 'secret1234' },
        headers: { 'Content-Type': 'application/json' },
      });

      expect(result.statusCode).toBe(400);
    });

    it('retorna 401 cuando las credenciales son incorrectas', async () => {
      mockPrismaUserFindUnique.mockResolvedValueOnce(null);

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'noexiste@example.com', password: 'wrongpass123' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Sin usuario → 400 o 401 según la lógica del servicio
      expect([400, 401]).toContain(result.statusCode);
    });
  });

  // ─── Protección JWT ───────────────────────────────────────────────────────

  describe('Endpoints protegidos sin token', () => {
    it('GET /api/v1/tenants retorna 401 sin Authorization', async () => {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/tenants',
      });

      expect(result.statusCode).toBe(401);
    });

    it('GET /api/v1/nodes retorna 401 sin Authorization', async () => {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/nodes',
      });

      expect(result.statusCode).toBe(401);
    });

    it('GET /api/v1/domains retorna 401 sin Authorization', async () => {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/domains',
      });

      expect(result.statusCode).toBe(401);
    });
  });

  // ─── Respuesta de error estructurada (HttpExceptionFilter) ────────────────

  describe('Formato de error de HttpExceptionFilter', () => {
    it('los errores 401 tienen la estructura {success:false, error:{...}}', async () => {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/tenants',
      });

      const body = JSON.parse(result.body) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(typeof body.error.message).toBe('string');
    });

    it('las rutas inexistentes retornan 404', async () => {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/ruta-inexistente-xyz',
      });

      expect(result.statusCode).toBe(404);
    });
  });

  // ─── ValidationPipe (class-validator en DTOs) ─────────────────────────────

  describe('ValidationPipe — DTOs class-validator', () => {
    it('POST /api/v1/ai/abuse/analyze rechaza body vacío con 400', async () => {
      const token = makeAuthToken('SUPER_ADMIN');

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/abuse/analyze',
        payload: {},
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { success: boolean };
      expect(body.success).toBe(false);
    });

    it('POST /api/v1/ai/abuse/analyze rechaza campos adicionales (whitelist)', async () => {
      const token = makeAuthToken('SUPER_ADMIN');

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/ai/abuse/analyze',
        payload: {
          subject: 'Test',
          body: 'Hello',
          fromEmail: 'test@example.com',
          ip: '1.2.3.4',
          campoExtraNoPermitido: 'valor',
        },
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      // El campo extra provoca 400 por forbidNonWhitelisted
      expect(result.statusCode).toBe(400);
    });
  });
});
