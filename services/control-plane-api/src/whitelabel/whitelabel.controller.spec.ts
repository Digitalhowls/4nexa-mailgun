import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { WhitelabelController } from './whitelabel.controller';
import { WhitelabelService } from './whitelabel.service';
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
  setConfig: jest.fn().mockResolvedValue({ id: 'wl1' }),
  getConfig: jest.fn().mockResolvedValue({ id: 'wl1' }),
  deleteConfig: jest.fn().mockResolvedValue(undefined),
};

describe('WhitelabelController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhitelabelController],
      providers: [{ provide: WhitelabelService, useValue: mockService }],
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

  it('POST /whitelabel con tenantId null → usa string vacío (rama ?? "")', async () => {
    const savedTenantId = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      await request(app.getHttpServer() as Server)
        .post('/whitelabel')
        .send({ brandName: 'Test', primaryColor: '#FF0000' });
    } finally {
      (adminUser as any).tenantId = savedTenantId;
    }
  });

  it('POST /whitelabel → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/whitelabel')
      .send({ logoUrl: 'https://example.com/logo.png' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /whitelabel → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/whitelabel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /whitelabel → 200', async () => {
    const res = await request(app.getHttpServer() as Server).delete('/whitelabel');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /whitelabel con tenantId null → rama ?? ""', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).get('/whitelabel');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });

  it('DELETE /whitelabel con tenantId null → rama ?? ""', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).delete('/whitelabel');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });
});
