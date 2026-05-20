import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { DnsOrchestrationController } from './dns-orchestration.controller';
import { DnsOrchestrationService } from './dns-orchestration.service';
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
  createProvider: jest.fn().mockResolvedValue({ id: 'dns1' }),
  listProviders: jest.fn().mockResolvedValue([{ id: 'dns1' }]),
  deleteProvider: jest.fn().mockResolvedValue(undefined),
  provisionDomain: jest.fn().mockResolvedValue({ status: 'PROVISIONED' }),
  verifyDomain: jest.fn().mockResolvedValue({ allPassed: true }),
  getDnsStatus: jest.fn().mockResolvedValue({ status: 'OK' }),
};

describe('DnsOrchestrationController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DnsOrchestrationController],
      providers: [{ provide: DnsOrchestrationService, useValue: mockService }],
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

  it('POST /dns-providers → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/dns-providers')
      .send({ name: 'cloudflare', apiToken: 'tok', zoneId: 'z1' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /dns-providers → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/dns-providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /dns-providers/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server).delete('/dns-providers/dns1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /domains/:id/dns/provision → 201', async () => {
    const res = await request(app.getHttpServer() as Server).post('/domains/d1/dns/provision');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /domains/:id/dns/verify → 201', async () => {
    const res = await request(app.getHttpServer() as Server).post('/domains/d1/dns/verify');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /domains/:id/dns/status → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/domains/d1/dns/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
