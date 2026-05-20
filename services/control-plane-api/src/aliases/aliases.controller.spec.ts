import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { AliasesController } from './aliases.controller';
import { AliasesService } from './aliases.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const DOMAIN_ID = 'bbbb0000-0000-0000-0000-000000000001';
const ALIAS_ID  = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_ALIAS = {
  id: ALIAS_ID,
  tenantId: TENANT_ID,
  domainId: DOMAIN_ID,
  source: 'info@empresa.com',
  destination: ['admin@empresa.com'],
  active: true,
};

const FAKE_PAGE = { items: [FAKE_ALIAS], total: 1, page: 1, pageSize: 20 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('AliasesController (HTTP)', () => {
  let app: INestApplication;

  const aliasesServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_ALIAS),
    findAll: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_ALIAS),
    update: jest.fn().mockResolvedValue(FAKE_ALIAS),
    remove: jest.fn().mockResolvedValue(FAKE_ALIAS),
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
      controllers: [AliasesController],
      providers: [
        { provide: AliasesService, useValue: aliasesServiceMock },
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

  it('POST /aliases → 201 con alias creado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/aliases')
      .send({
        tenantId: TENANT_ID,
        domainId: DOMAIN_ID,
        source: 'info@empresa.com',
        destination: 'admin@empresa.com',
      })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: ALIAS_ID } });
  });

  it('GET /aliases → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/aliases')
      .query({ page: 1, pageSize: 20 })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /aliases/:id → 200 con alias', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/aliases/${ALIAS_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: ALIAS_ID } });
  });

  it('PATCH /aliases/:id → 200 con alias actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/aliases/${ALIAS_ID}`)
      .send({ active: false })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('DELETE /aliases/:id → 204 sin cuerpo', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/aliases/${ALIAS_ID}`)
      .expect(204);
  });
});
