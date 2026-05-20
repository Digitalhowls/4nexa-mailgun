import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_ID    = 'aaaa0000-0000-0000-0000-000000000001';
const TENANT_ID = 'bbbb0000-0000-0000-0000-000000000001';

const FAKE_JOB = {
  id: JOB_ID,
  tenantId: TENANT_ID,
  provider: 'GENERIC_IMAP',
  status: 'PENDING',
  progress: 0,
  createdAt: new Date().toISOString(),
};

const FAKE_LIST = { items: [FAKE_JOB], total: 1 };

const CREATE_BODY = {
  tenantId: TENANT_ID,
  provider: 'GENERIC_IMAP',
  sourceHost: 'imap.old-provider.com',
  sourcePort: 993,
  sourceUsername: 'user@empresa.com',
  sourcePassword: 'SecretPassword123',
  sourceTls: true,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('MigrationController (HTTP)', () => {
  let app: INestApplication;

  const migrationServiceMock = {
    createJob: jest.fn().mockResolvedValue(FAKE_JOB),
    listJobs: jest.fn().mockResolvedValue(FAKE_LIST),
    getJob: jest.fn().mockResolvedValue(FAKE_JOB),
    pauseJob: jest.fn().mockResolvedValue({ ...FAKE_JOB, status: 'PAUSED' }),
    resumeJob: jest.fn().mockResolvedValue({ ...FAKE_JOB, status: 'RUNNING' }),
    cancelJob: jest.fn().mockResolvedValue({ ...FAKE_JOB, status: 'CANCELLED' }),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MigrationController],
      providers: [{ provide: MigrationService, useValue: migrationServiceMock }],
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

  it('POST /migration/jobs → 201 con job creado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/migration/jobs')
      .send(CREATE_BODY)
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: JOB_ID } });
  });

  it('GET /migration/jobs → 200 con lista', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/migration/jobs')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /migration/jobs/:id → 200 con job', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/migration/jobs/${JOB_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: JOB_ID } });
  });

  it('PATCH /migration/jobs/:id/pause → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/migration/jobs/${JOB_ID}/pause`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'PAUSED' } });
  });

  it('PATCH /migration/jobs/:id/resume → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/migration/jobs/${JOB_ID}/resume`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'RUNNING' } });
  });

  it('DELETE /migration/jobs/:id → 200 con cancelación', async () => {
    const res = await request(app.getHttpServer() as Server)
      .delete(`/migration/jobs/${JOB_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { status: 'CANCELLED' } });
  });
});
