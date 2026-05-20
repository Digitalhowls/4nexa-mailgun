import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { BrainController } from './brain.controller';
import { BrainService } from './brain.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const CELL_ID   = 'bbbb0000-0000-0000-0000-000000000001';

const FAKE_CELL = {
  id: CELL_ID,
  tenantId: TENANT_ID,
  scope: 'REPUTATION',
  key: 'score',
  payload: { value: 95 },
  expiresAt: null,
};

const FAKE_PAGE = { items: [FAKE_CELL], total: 1 };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('BrainController (HTTP)', () => {
  let app: INestApplication;

  const brainServiceMock = {
    upsertCell: jest.fn().mockResolvedValue(FAKE_CELL),
    queryCells: jest.fn().mockResolvedValue(FAKE_PAGE),
    getCell: jest.fn().mockResolvedValue(FAKE_CELL),
    deleteCell: jest.fn().mockResolvedValue(undefined),
    deleteTenantCells: jest.fn().mockResolvedValue(3),
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
      controllers: [BrainController],
      providers: [
        { provide: BrainService, useValue: brainServiceMock },
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

  it('POST /brain/cells → 200 con celda creada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/brain/cells')
      .send({ scope: 'REPUTATION', key: 'score', payload: { value: 95 } })
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: CELL_ID } });
  });

  it('GET /brain/cells → 200 con lista', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/brain/cells')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /brain/cells/:scope/:key → 200 con celda', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/brain/cells/REPUTATION/score')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { key: 'score' } });
  });

  it('DELETE /brain/cells → 200 al eliminar celda', async () => {
    const res = await request(app.getHttpServer() as Server)
      .delete('/brain/cells')
      .send({ scope: 'REPUTATION', key: 'score' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('DELETE /brain/cells/tenant/:tenantId → 200 con conteo', async () => {
    const res = await request(app.getHttpServer() as Server)
      .delete(`/brain/cells/tenant/${TENANT_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { deletedCount: 3 } });
  });
});
