import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { DeliverabilityController } from './deliverability.controller';
import { DeliverabilityService } from './deliverability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DOMAIN_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_GOVERNANCE = {
  domainId: DOMAIN_ID,
  reputationScore: 85,
  dkimValid: true,
  spfValid: true,
  dmarcValid: true,
  canSend: true,
};

const FAKE_PERMISSION = {
  allowed: true,
  reason: 'All checks passed',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('DeliverabilityController (HTTP)', () => {
  let app: INestApplication;

  const deliverabilityServiceMock = {
    getDomainGovernance: jest.fn().mockResolvedValue(FAKE_GOVERNANCE),
    checkSendPermission: jest.fn().mockResolvedValue(FAKE_PERMISSION),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliverabilityController],
      providers: [{ provide: DeliverabilityService, useValue: deliverabilityServiceMock }],
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

  it('GET /deliverability/domain/:id → 200 con governance', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/deliverability/domain/${DOMAIN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { reputationScore: 85 } });
  });

  it('POST /deliverability/check → 200 con permiso de envío', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/deliverability/check')
      .send({ domainId: DOMAIN_ID, estimatedVolume: 100 })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { allowed: true } });
  });
});
