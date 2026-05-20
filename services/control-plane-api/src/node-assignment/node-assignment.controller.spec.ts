import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { NodeAssignmentController } from './node-assignment.controller';
import { NodeAssignmentService } from './node-assignment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NODE_ID   = 'aaaa0000-0000-0000-0000-000000000001';
const TENANT_ID = 'bbbb0000-0000-0000-0000-000000000001';
const DOMAIN_ID = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_NODE = { id: NODE_ID, hostname: 'mx01.4nexa.io', score: 95 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('NodeAssignmentController (HTTP)', () => {
  let app: INestApplication;

  const nodeAssignmentMock = {
    findBestNode: jest.fn().mockResolvedValue(FAKE_NODE),
    assignTenantToNode: jest.fn().mockResolvedValue({ tenantId: TENANT_ID, nodeId: NODE_ID }),
    assignDomainToNode: jest.fn().mockResolvedValue({ domainId: DOMAIN_ID, nodeId: NODE_ID }),
    drainNode: jest.fn().mockResolvedValue({ nodeId: NODE_ID, migratedTenants: 2 }),
    quarantineNode: jest.fn().mockResolvedValue({ nodeId: NODE_ID, status: 'QUARANTINED' }),
    reactivateNode: jest.fn().mockResolvedValue({ nodeId: NODE_ID, status: 'ACTIVE' }),
    setWarmupStatus: jest.fn().mockResolvedValue({ nodeId: NODE_ID, warmupStatus: 'WARM' }),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodeAssignmentController],
      providers: [{ provide: NodeAssignmentService, useValue: nodeAssignmentMock }],
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

  it('GET /node-assignment/best-node → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/node-assignment/best-node')
      .expect(200);

    expect(res.body).toMatchObject({ id: NODE_ID });
  });

  it('POST /node-assignment/tenant/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/tenant/${TENANT_ID}`)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ tenantId: TENANT_ID, nodeId: NODE_ID });
  });

  it('POST /node-assignment/domain/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/domain/${DOMAIN_ID}`)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ domainId: DOMAIN_ID, nodeId: NODE_ID });
  });

  it('POST /node-assignment/drain/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/drain/${NODE_ID}`)
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({ nodeId: NODE_ID, migratedTenants: 2 });
  });

  it('POST /node-assignment/quarantine/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/quarantine/${NODE_ID}`)
      .send({ reason: 'Disco lleno al 95%' })
      .expect(200);

    expect(res.body).toMatchObject({ nodeId: NODE_ID, status: 'QUARANTINED' });
  });

  it('POST /node-assignment/reactivate/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/reactivate/${NODE_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ nodeId: NODE_ID, status: 'ACTIVE' });
  });

  it('POST /node-assignment/warmup/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/node-assignment/warmup/${NODE_ID}`)
      .send({ warmupStatus: 'WARM' })
      .expect(200);

    expect(res.body).toMatchObject({ nodeId: NODE_ID, warmupStatus: 'WARM' });
  });
});
