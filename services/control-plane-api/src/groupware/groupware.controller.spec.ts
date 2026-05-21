import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { GroupwareController } from './groupware.controller';
import { GroupwareService } from './groupware.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

const adminUser = {
  sub: 'admin-id',
  email: 'admin@4nexa.io',
  role: UserRole.SUPER_ADMIN,
  tenantId: 't1',
  jti: 'jti-1',
};

const mockService = {
  enableCalendar: jest.fn().mockResolvedValue({ id: 'cal1' }),
  listCalendars: jest.fn().mockResolvedValue([{ id: 'cal1' }]),
  getFreeBusy: jest.fn().mockResolvedValue({ slots: [] }),
};

describe('GroupwareController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupwareController],
      providers: [{ provide: GroupwareService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => { ctx.switchToHttp().getRequest().user = adminUser; return true; } })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /mailboxes/:id/calendar → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/mailboxes/mb1/calendar')
      .send({ easEnabled: true });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /mailboxes/:id/calendars → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/mailboxes/mb1/calendars');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /domains/:id/free-busy → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/domains/d1/free-busy');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /mailboxes/:id/calendar con tenantId null → usa string vacío (rama ?? "")', async () => {
    const savedTenantId = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      await request(app.getHttpServer() as Server)
        .post('/mailboxes/mb1/calendar');
    } finally {
      (adminUser as any).tenantId = savedTenantId;
    }
  });

  it('GET /mailboxes/:id/calendars con tenantId null → rama ?? ""', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).get('/mailboxes/mb1/calendars');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });

  it('GET /domains/:id/free-busy con tenantId null → rama ?? ""', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).get('/domains/d1/free-busy');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });
});
