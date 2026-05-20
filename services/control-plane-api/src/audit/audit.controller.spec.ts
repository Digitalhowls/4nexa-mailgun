import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LOG_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_LOG = {
  id: LOG_ID,
  userId: 'admin-id',
  action: 'tenant.created',
  entityType: 'tenant',
  entityId: 'bbbb0000-0000-0000-0000-000000000001',
  createdAt: new Date('2026-01-01').toISOString(),
};

const FAKE_PAGE = { items: [FAKE_LOG], total: 1, page: 1, pageSize: 20 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('AuditController (HTTP)', () => {
  let app: INestApplication;

  const auditServiceMock = {
    list: jest.fn().mockResolvedValue(FAKE_PAGE),
    findById: jest.fn().mockResolvedValue(FAKE_LOG),
    verifyIntegrity: jest.fn().mockResolvedValue({ valid: true }),
    verifyRange: jest.fn().mockResolvedValue({ totalChecked: 10, passed: 10, failed: 0 }),
    log: jest.fn().mockResolvedValue(undefined),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: auditServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = adminUser;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  it('GET /audit → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/audit')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /audit/:id → 200 con log', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/audit/${LOG_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: LOG_ID } });
  });

  it('GET /audit/:id/verify → 200 con resultado de integridad', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/audit/${LOG_ID}/verify`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { valid: true } });
  });

  it('POST /audit/verify-range → 200 con resultado de rango', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/audit/verify-range')
      .send({ startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-31T23:59:59Z' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { totalChecked: 10 } });
  });
});
