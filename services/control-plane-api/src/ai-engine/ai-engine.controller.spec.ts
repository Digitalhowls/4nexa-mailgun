import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';
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
  analyzeAbuse: jest.fn().mockResolvedValue({ score: 0.1, flags: [] }),
  classifyMail: jest.fn().mockResolvedValue({ category: 'transactional' }),
  diagnoseSupport: jest.fn().mockResolvedValue({ answer: 'ok' }),
  extractInvoiceData: jest.fn().mockResolvedValue({ total: 100 }),
};

describe('AiEngineController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiEngineController],
      providers: [{ provide: AiEngineService, useValue: mockService }],
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

  it('POST /ai/abuse/analyze → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/ai/abuse/analyze')
      .send({ subject: 'test', body: 'msg', fromEmail: 'a@b.com', ip: '1.2.3.4' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /ai/mail/classify → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/ai/mail/classify')
      .send({ subject: 'Hello', body: 'World', fromEmail: 'a@b.com' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /ai/support/diagnose → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/ai/support/diagnose')
      .send({ question: 'Why is DKIM failing?' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /ai/invoice/extract → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/ai/invoice/extract')
      .send({ text: 'Invoice total: $100' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
