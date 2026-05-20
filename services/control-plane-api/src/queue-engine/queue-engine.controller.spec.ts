import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { QueueEngineController } from './queue-engine.controller';
import { QueueEngineService } from './queue-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NODE_ID = 'aaaa0000-0000-0000-0000-000000000001';
const JOB_ID  = 'job-abc-123';

const FAKE_STATS = {
  mainQueue: { waiting: 2, active: 1, completed: 100, failed: 3, delayed: 0 },
  dlq: { waiting: 3, active: 0, completed: 0, failed: 0, delayed: 0 },
};

const FAKE_JOBS = { items: [{ id: JOB_ID, name: 'process.email', state: 'failed' }], total: 1 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('QueueEngineController (HTTP)', () => {
  let app: INestApplication;

  const queueServiceMock = {
    getStats: jest.fn().mockResolvedValue(FAKE_STATS),
    getJobs: jest.fn().mockResolvedValue(FAKE_JOBS),
    retryJob: jest.fn().mockResolvedValue(undefined),
    purgeByState: jest.fn().mockResolvedValue(5),
    getDlqJobs: jest.fn().mockResolvedValue(FAKE_JOBS),
    restoreDlqJob: jest.fn().mockResolvedValue(undefined),
    getNodeQueueStats: jest.fn().mockResolvedValue({ pending: 10, active: 2 }),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueEngineController],
      providers: [{ provide: QueueEngineService, useValue: queueServiceMock }],
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

  it('GET /queue-engine/stats → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/queue-engine/stats')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { mainQueue: { failed: 3 } } });
  });

  it('GET /queue-engine/jobs → 200 con lista', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/queue-engine/jobs?state=failed')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('POST /queue-engine/jobs/:id/retry → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/queue-engine/jobs/${JOB_ID}/retry`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('DELETE /queue-engine/purge → 200 con conteo', async () => {
    const res = await request(app.getHttpServer() as Server)
      .delete('/queue-engine/purge?state=failed')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { purged: 5 } });
  });

  it('GET /queue-engine/dlq → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/queue-engine/dlq')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('POST /queue-engine/dlq/:id/restore → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/queue-engine/dlq/${JOB_ID}/restore`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /queue-engine/nodes/:nodeId/queue-stats → 200', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/queue-engine/nodes/${NODE_ID}/queue-stats`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { pending: 10 } });
  });
});
