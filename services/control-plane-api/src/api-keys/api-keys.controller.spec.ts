import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
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
  create: jest.fn().mockResolvedValue({ id: 'key1', key: 'ak_live_xxx' }),
  list: jest.fn().mockResolvedValue([{ id: 'key1' }]),
  revoke: jest.fn().mockResolvedValue(undefined),
  rotate: jest.fn().mockResolvedValue({ id: 'key1', key: 'ak_live_yyy' }),
};

describe('ApiKeysController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeysService, useValue: mockService }],
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

  it('POST /api-keys → 201', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/api-keys')
      .send({ name: 'My Key', scopes: ['SEND_MAIL'] });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /api-keys → 200', async () => {
    const res = await request(app.getHttpServer() as Server).get('/api-keys');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api-keys/:id → 200', async () => {
    const res = await request(app.getHttpServer() as Server).delete('/api-keys/key1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /api-keys/:id/rotate → 200', async () => {
    const res = await request(app.getHttpServer() as Server).patch('/api-keys/key1/rotate');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api-keys con tenantId null → usa string vacío (rama ?? "")', async () => {
    const savedTenantId = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server)
        .post('/api-keys')
        .send({ name: 'Key Null Tenant', scopes: ['SEND_MAIL'] });
      expect(res.status).toBe(201);
    } finally {
      (adminUser as any).tenantId = savedTenantId;
    }
  });

  it('GET /api-keys con tenantId null → usa string vacío (rama ?? "")', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).get('/api-keys');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });

  it('DELETE /api-keys/:id con tenantId null → usa string vacío (rama ?? "")', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).delete('/api-keys/key1');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });

  it('PATCH /api-keys/:id/rotate con tenantId null → usa string vacío (rama ?? "")', async () => {
    const saved = adminUser.tenantId;
    (adminUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server).patch('/api-keys/key1/rotate');
      expect(res.status).toBe(200);
    } finally {
      (adminUser as any).tenantId = saved;
    }
  });
});
