import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { BimiController } from './bimi.controller';
import { BimiService } from './bimi.service';
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
  configureBimi: jest.fn().mockResolvedValue({ id: 'bimi1' }),
  getBimiConfig: jest.fn().mockResolvedValue({ id: 'bimi1' }),
  getBimiDnsRecord: jest.fn().mockResolvedValue({ record: 'v=BIMI1' }),
};

describe('BimiController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BimiController],
      providers: [{ provide: BimiService, useValue: mockService }],
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

  it('POST /domains/:id/bimi → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/domains/d1/bimi')
      .send({ logoUrl: 'https://example.com/logo.svg' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /domains/:id/bimi → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/domains/d1/bimi');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /domains/:id/bimi/dns-record → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/domains/d1/bimi/dns-record');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
