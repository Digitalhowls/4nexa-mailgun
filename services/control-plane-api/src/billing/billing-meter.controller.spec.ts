import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { BillingMeterController } from './billing-meter.controller';
import { BillingMeterService } from './billing-meter.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_SNAPSHOT = {
  tenantId: TENANT_ID,
  billingStatus: 'ACTIVE',
  sentEmails: 1200,
  activeMailboxes: 5,
  storageGb: 2.5,
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-01-31T23:59:59.000Z',
};

const FAKE_TRANSITION = {
  tenantId: TENANT_ID,
  billingStatus: 'GRACE',
  previousStatus: 'ACTIVE',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('BillingMeterController (HTTP)', () => {
  let app: INestApplication;

  const billingServiceMock = {
    getMeterSnapshot: jest.fn().mockResolvedValue(FAKE_SNAPSHOT),
    transitionBillingStatus: jest.fn().mockResolvedValue(FAKE_TRANSITION),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingMeterController],
      providers: [{ provide: BillingMeterService, useValue: billingServiceMock }],
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

  it('GET /billing/meter/:tenantId → 200 con snapshot', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/billing/meter/${TENANT_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { tenantId: TENANT_ID } });
  });

  it('POST /billing/transition/:tenantId → 200 con transición', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/billing/transition/${TENANT_ID}`)
      .send({ newStatus: 'GRACE', reason: 'Pago pendiente del mes actual' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { billingStatus: 'GRACE' } });
  });
});
