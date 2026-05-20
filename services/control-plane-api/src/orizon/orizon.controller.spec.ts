import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { OrizonController } from './orizon.controller';
import { OrizonService } from './orizon.service';
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
  syncTenant: jest.fn().mockResolvedValue({ synced: true }),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
  handleWebhook: jest.fn().mockResolvedValue(undefined),
};

describe('OrizonController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrizonController],
      providers: [{ provide: OrizonService, useValue: mockService }],
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

  it('POST /orizon/sync → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/orizon/sync');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /orizon/webhook con firma válida → 201', async () => {
    mockService.verifyWebhookSignature.mockReturnValueOnce(true);
    const res = await request(app.getHttpServer() as Server)
      .post('/orizon/webhook')
      .set('x-4nexa-signature', 'valid-sig')
      .send({ event: 'test' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /orizon/webhook con firma inválida → 400', async () => {
    mockService.verifyWebhookSignature.mockReturnValueOnce(false);
    const res = await request(app.getHttpServer() as Server)
      .post('/orizon/webhook')
      .set('x-4nexa-signature', 'bad-sig')
      .send({ event: 'test' });
    expect(res.status).toBe(400);
  });
});
