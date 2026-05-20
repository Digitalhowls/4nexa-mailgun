import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { DisasterRecoveryController } from './disaster-recovery.controller';
import { DisasterRecoveryService } from './disaster-recovery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_STATUS = { healthy: true, nodes: 1, tenants: 5, lastCheck: new Date().toISOString() };
const FAKE_SIMULATE = { dryRun: true, scenario: 'node_loss', actionsExecuted: 0, log: [] };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('DisasterRecoveryController (HTTP)', () => {
  let app: INestApplication;

  const drServiceMock = {
    getSystemStatus: jest.fn().mockResolvedValue(FAKE_STATUS),
    simulate: jest.fn().mockResolvedValue(FAKE_SIMULATE),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DisasterRecoveryController],
      providers: [{ provide: DisasterRecoveryService, useValue: drServiceMock }],
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

  it('GET /dr/status → 200 con estado del sistema', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/dr/status')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { healthy: true } });
  });

  it('GET /dr/plans/:scenario → 200 con plan DR', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/dr/plans/node_loss')
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /dr/plans/:scenario → 200 con error para escenario desconocido', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/dr/plans/escenario_invalido')
      .expect(200);

    expect(res.body).toMatchObject({ error: expect.stringContaining('Válidos') });
  });

  it('POST /dr/simulate → 200 con resultado de simulación', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/dr/simulate')
      .send({ scenario: 'node_loss', dryRun: true })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { dryRun: true } });
  });
});
