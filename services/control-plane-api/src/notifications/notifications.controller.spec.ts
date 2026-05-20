import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
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
  createChannel: jest.fn().mockResolvedValue({ id: 'ch1' }),
  listChannels: jest.fn().mockResolvedValue([{ id: 'ch1' }]),
  deleteChannel: jest.fn().mockResolvedValue(undefined),
};

describe('NotificationsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
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

  it('POST /notification-channels → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/notification-channels')
      .send({ type: 'EMAIL', config: {} });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /notification-channels → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/notification-channels');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /notification-channels/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server).delete('/notification-channels/ch1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
