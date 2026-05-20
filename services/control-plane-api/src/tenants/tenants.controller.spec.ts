import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const NODE_ID   = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_TENANT = {
  id: TENANT_ID,
  name: 'Mi Empresa',
  slug: 'mi-empresa',
  billingEmail: 'admin@empresa.com',
  status: 'TRIAL',
  billingStatus: 'ACTIVE',
  planId: null,
  nodeId: NODE_ID,
};

const FAKE_PAGE = { items: [FAKE_TENANT], total: 1, page: 1, pageSize: 20 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('TenantsController (HTTP)', () => {
  let app: INestApplication;

  const tenantsServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_TENANT),
    findAll: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_TENANT),
    update: jest.fn().mockResolvedValue(FAKE_TENANT),
    suspend: jest.fn().mockResolvedValue({ ...FAKE_TENANT, status: 'SUSPENDED' }),
    reactivate: jest.fn().mockResolvedValue({ ...FAKE_TENANT, status: 'ACTIVE' }),
    assignNode: jest.fn().mockResolvedValue({ ...FAKE_TENANT, nodeId: NODE_ID }),
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
      controllers: [TenantsController],
      providers: [
        { provide: TenantsService, useValue: tenantsServiceMock },
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

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  it('POST /tenants → 201 con envelope success', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/tenants')
      .send({
        name: 'Mi Empresa',
        billingEmail: 'admin@empresa.com',
        slug: 'mi-empresa',
      })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: TENANT_ID } });
    expect(tenantsServiceMock.create).toHaveBeenCalled();
  });

  it('GET /tenants → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/tenants')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /tenants/:id → 200 con tenant', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/tenants/${TENANT_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: TENANT_ID } });
  });

  it('PATCH /tenants/:id → 200 con tenant actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/tenants/${TENANT_ID}`)
      .send({ name: 'Empresa Actualizada' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /tenants/:id/suspend → 200 con tenant suspendido', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/tenants/${TENANT_ID}/suspend`)
      .send({ reason: 'Impago' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'SUSPENDED' } });
  });

  it('POST /tenants/:id/reactivate → 200 con tenant reactivado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/tenants/${TENANT_ID}/reactivate`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'ACTIVE' } });
  });

  it('POST /tenants/:id/assign-node → 200 con nodeId asignado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/tenants/${TENANT_ID}/assign-node`)
      .send({ nodeId: NODE_ID })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { nodeId: NODE_ID } });
  });
});
