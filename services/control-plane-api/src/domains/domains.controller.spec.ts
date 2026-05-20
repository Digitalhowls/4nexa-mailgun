import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const DOMAIN_ID = 'bbbb0000-0000-0000-0000-000000000001';

const FAKE_DOMAIN = {
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  domain: 'empresa.com',
  status: 'ACTIVE',
  deletedAt: null,
};

const FAKE_PAGE = { items: [FAKE_DOMAIN], total: 1, page: 1, pageSize: 20 };

const FAKE_DNS_RESULT = {
  domain: FAKE_DOMAIN,
  dnsCheck: { allPassed: true, records: [] },
};

const FAKE_INSTRUCTIONS = {
  domain: FAKE_DOMAIN,
  records: [],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('DomainsController (HTTP)', () => {
  let app: INestApplication;

  const domainsServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_DOMAIN),
    findAll: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_DOMAIN),
    update: jest.fn().mockResolvedValue(FAKE_DOMAIN),
    verifyDns: jest.fn().mockResolvedValue(FAKE_DNS_RESULT),
    getDnsInstructions: jest.fn().mockResolvedValue(FAKE_INSTRUCTIONS),
    softDelete: jest.fn().mockResolvedValue(FAKE_DOMAIN),
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
      controllers: [DomainsController],
      providers: [
        { provide: DomainsService, useValue: domainsServiceMock },
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

  it('POST /domains → 201 con dominio creado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/domains')
      .send({ tenantId: TENANT_ID, domain: 'empresa.com' })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: DOMAIN_ID } });
  });

  it('GET /domains → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/domains')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /domains/:id → 200 con dominio', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/domains/${DOMAIN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: DOMAIN_ID } });
  });

  it('PATCH /domains/:id → 200 con dominio actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/domains/${DOMAIN_ID}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /domains/:id/verify-dns → 200 con resultado DNS', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/domains/${DOMAIN_ID}/verify-dns`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { dnsCheck: { allPassed: true } } });
  });

  it('GET /domains/:id/dns-instructions → 200 con instrucciones', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/domains/${DOMAIN_ID}/dns-instructions`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('DELETE /domains/:id → 204 sin cuerpo', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/domains/${DOMAIN_ID}`)
      .expect(204);
  });
});
