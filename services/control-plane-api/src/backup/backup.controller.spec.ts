import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NODE_ID  = 'aaaa0000-0000-0000-0000-000000000001';
const JOB_ID   = 'bbbb0000-0000-0000-0000-000000000001';

const FAKE_JOB = {
  id: JOB_ID,
  nodeId: NODE_ID,
  type: 'FULL_NODE',
  status: 'PENDING',
  startedAt: null,
  completedAt: null,
};

const FAKE_PAGE = { items: [FAKE_JOB], total: 1, page: 1, pageSize: 20 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('BackupController (HTTP)', () => {
  let app: INestApplication;

  const backupServiceMock = {
    triggerBackup: jest.fn().mockResolvedValue(FAKE_JOB),
    listJobs: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_JOB),
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
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: backupServiceMock },
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

  it('POST /backup/trigger → 201 con job de backup', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/backup/trigger')
      .send({ nodeId: NODE_ID, type: 'FULL_NODE' })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: JOB_ID } });
  });

  it('GET /backup → 200 con lista de jobs', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/backup')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /backup/:id → 200 con job', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/backup/${JOB_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: JOB_ID } });
  });
});
