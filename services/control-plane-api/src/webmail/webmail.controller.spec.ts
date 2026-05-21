import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { WebmailController } from './webmail.controller';
import { WebmailService } from './webmail.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '@4nexa/types';

describe('WebmailController (HTTP)', () => {
  let app: INestApplication;

  const webmailServiceMock = {
    generateSsoToken: jest.fn().mockResolvedValue({ token: 'sso-token-123', expiresAt: new Date().toISOString() }),
  };

  const tenantUser = {
    sub: 'user-id',
    email: 'user@empresa.com',
    role: UserRole.TENANT_MAILBOX_USER,
    tenantId: 'aaaa0000-0000-0000-0000-000000000001',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebmailController],
      providers: [{ provide: WebmailService, useValue: webmailServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = tenantUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  it('POST /auth/webmail-token → 200 con token SSO', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/auth/webmail-token')
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { token: 'sso-token-123' } });
  });

  it('POST /auth/webmail-token con tenantId null → usa string vacío (rama ?? "")', async () => {
    const savedTenantId = tenantUser.tenantId;
    (tenantUser as any).tenantId = null;
    try {
      const res = await request(app.getHttpServer() as Server)
        .post('/auth/webmail-token')
        .expect(201);
      expect(res.body.success).toBe(true);
    } finally {
      (tenantUser as any).tenantId = savedTenantId;
    }
  });
});
