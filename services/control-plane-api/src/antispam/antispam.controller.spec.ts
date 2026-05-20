import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { AntispamController } from './antispam.controller';
import { AntispamService } from './antispam.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DOMAIN_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_POLICY = {
  id: 'pppp0000-0000-0000-0000-000000000001',
  domainId: DOMAIN_ID,
  enabled: true,
  spamThreshold: 0.80,
  rejectAbove: 0.95,
  greylistEnabled: false,
  whitelist: [],
  blacklist: [],
};

const EVAL_RESULT = { action: 'ALLOW', spamScore: 0.10, matched: null };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('AntispamController (HTTP)', () => {
  let app: INestApplication;

  const antispamServiceMock = {
    getPolicy: jest.fn().mockResolvedValue(FAKE_POLICY),
    upsertPolicy: jest.fn().mockResolvedValue(FAKE_POLICY),
    deletePolicy: jest.fn().mockResolvedValue({ deleted: true }),
    evaluateMessage: jest.fn().mockResolvedValue(EVAL_RESULT),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AntispamController],
      providers: [{ provide: AntispamService, useValue: antispamServiceMock }],
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

  it('GET /antispam/policy/:domainId → 200 con política', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/antispam/policy/${DOMAIN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { domainId: DOMAIN_ID } });
  });

  it('PUT /antispam/policy/:domainId → 200 con política actualizada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .put(`/antispam/policy/${DOMAIN_ID}`)
      .send({ enabled: true, spamThreshold: 0.80, rejectAbove: 0.95 })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { enabled: true } });
  });

  it('DELETE /antispam/policy/:domainId → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .delete(`/antispam/policy/${DOMAIN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { deleted: true } });
  });

  it('POST /antispam/evaluate/:domainId → 200 con resultado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/antispam/evaluate/${DOMAIN_ID}`)
      .send({ senderEmail: 'test@sender.com', spamScore: 0.10 })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { action: 'ALLOW' } });
  });
});
