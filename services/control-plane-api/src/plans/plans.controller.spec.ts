import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAN_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_PLAN = {
  id: PLAN_ID,
  name: 'Plan Básico',
  slug: 'plan-basico',
  maxDomains: 5,
  maxMailboxes: 20,
  storageTotalBytes: '10737418240',
  storagePerMailboxBytes: '536870912',
  outboundDailyLimit: 1000,
  antivirusEnabled: false,
  backupRetentionDays: 7,
  priceMonthly: 9.99,
  priceYearly: 99.99,
  active: true,
  isPublic: true,
};

const CREATE_BODY = {
  name: 'Plan Básico',
  maxDomains: 5,
  maxMailboxes: 20,
  storageTotalBytes: 10737418240,
  storagePerMailboxBytes: 536870912,
  outboundDailyLimit: 1000,
  antivirusEnabled: false,
  backupRetentionDays: 7,
  priceMonthly: '9.99',
  priceYearly: '99.99',
  active: true,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('PlansController (HTTP)', () => {
  let app: INestApplication;

  const plansServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_PLAN),
    findAll: jest.fn().mockResolvedValue([FAKE_PLAN]),
    findOne: jest.fn().mockResolvedValue(FAKE_PLAN),
    update: jest.fn().mockResolvedValue(FAKE_PLAN),
    remove: jest.fn().mockResolvedValue(FAKE_PLAN),
  };

  const auditMock = { log: jest.fn().mockResolvedValue(undefined) };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [
        { provide: PlansService, useValue: plansServiceMock },
        { provide: AuditService, useValue: auditMock },
      ],
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

  it('POST /plans → 201 con envelope success', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/plans')
      .send(CREATE_BODY)
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: PLAN_ID } });
  });

  it('GET /plans → 200 con lista de planes', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/plans')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: [{ id: PLAN_ID }] });
  });

  it('GET /plans/:id → 200 con plan', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/plans/${PLAN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: PLAN_ID } });
  });

  it('PATCH /plans/:id → 200 con plan actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/plans/${PLAN_ID}`)
      .send({ name: 'Plan Actualizado' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('DELETE /plans/:id → 204 sin cuerpo', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/plans/${PLAN_ID}`)
      .expect(204);
  });
});
