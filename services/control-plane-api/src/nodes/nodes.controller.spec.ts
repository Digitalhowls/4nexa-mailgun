import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NODE_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_NODE = {
  id: NODE_ID,
  name: 'node-01',
  fqdn: 'node01.empresa.com',
  ipAddress: '10.0.0.1',
  status: 'ACTIVE',
  maintenance: false,
  lastAgentPingAt: null,
};

const FAKE_PAGE = { items: [FAKE_NODE], total: 1, page: 1, pageSize: 20 };

const FAKE_HEALTH = {
  node: FAKE_NODE,
  agentReachable: true,
  latencyMs: 12,
};

const FAKE_PUSH_RESULT = {
  configVersion: 1,
  appliedSections: ['postfix', 'dovecot', 'rspamd'],
};

const FAKE_CERT = {
  certPem: '-----BEGIN CERTIFICATE-----\n...',
  fingerprint: 'AA:BB:CC:DD',
  expiresAt: new Date('2027-01-01'),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('NodesController (HTTP)', () => {
  let app: INestApplication;

  const nodesServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_NODE),
    findAll: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_NODE),
    update: jest.fn().mockResolvedValue(FAKE_NODE),
    setMaintenance: jest.fn().mockResolvedValue({ ...FAKE_NODE, maintenance: true }),
    reportAgentPing: jest.fn().mockResolvedValue(undefined),
    pushConfig: jest.fn().mockResolvedValue(FAKE_PUSH_RESULT),
    validateConfig: jest.fn().mockResolvedValue({ valid: true }),
    enrollNodeCert: jest.fn().mockResolvedValue(FAKE_CERT),
    rotateCert: jest.fn().mockResolvedValue(FAKE_CERT),
    getActiveCert: jest.fn().mockResolvedValue(FAKE_CERT),
    remove: jest.fn().mockResolvedValue(FAKE_NODE),
    healthCheck: jest.fn().mockResolvedValue(FAKE_HEALTH),
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
      controllers: [NodesController],
      providers: [
        { provide: NodesService, useValue: nodesServiceMock },
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

  it('POST /nodes → 201 con nodo creado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/nodes')
      .send({ hostname: 'node01.empresa.com', ipV4: '10.0.0.1', provider: 'hetzner', region: 'eu-central' })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: NODE_ID } });
  });

  it('GET /nodes → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/nodes')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /nodes/:id → 200 con nodo', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/nodes/${NODE_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: NODE_ID } });
  });

  it('PATCH /nodes/:id → 200 con nodo actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/nodes/${NODE_ID}`)
      .send({ name: 'node-01-updated' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /nodes/:id/maintenance → 200 con modo mantenimiento activado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/nodes/${NODE_ID}/maintenance`)
      .send({ maintenance: true })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { maintenance: true } });
  });

  it('POST /nodes/:id/agent-ping → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/nodes/${NODE_ID}/agent-ping`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /nodes/:id/push-config → 200 con secciones aplicadas', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/nodes/${NODE_ID}/push-config`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { configVersion: 1 } });
  });

  it('GET /nodes/:id/validate-config → 200 con resultado de validación', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/nodes/${NODE_ID}/validate-config`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { valid: true } });
  });

  it('POST /nodes/:id/enroll → 201 con certificado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/nodes/${NODE_ID}/enroll`)
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { fingerprint: 'AA:BB:CC:DD' } });
  });

  it('POST /nodes/:id/rotate-cert → 200 con certificado rotado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/nodes/${NODE_ID}/rotate-cert`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /nodes/:id/cert → 200 con certificado activo', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/nodes/${NODE_ID}/cert`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });
});
