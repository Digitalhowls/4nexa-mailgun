import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { CredentialRotationController } from './credential-rotation.controller';
import { CredentialRotationService } from './credential-rotation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DOMAIN_ID = 'aaaa0000-0000-0000-0000-000000000001';

const FAKE_DKIM_STATUS = {
  domainId: DOMAIN_ID,
  selector: 'mail2026',
  publicKey: 'v=DKIM1; k=rsa; p=BASE64PUBKEY...',
  issuedAt: new Date('2026-01-01').toISOString(),
};

const FAKE_ROTATE_RESULT = {
  domainId: DOMAIN_ID,
  selector: 'mail2027',
  publicKey: 'v=DKIM1; k=rsa; p=NEWBASE64PUBKEY...',
  dnsRecord: 'mail2027._domainkey.empresa.com TXT ...',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('CredentialRotationController (HTTP)', () => {
  let app: INestApplication;

  const credentialServiceMock = {
    getDkimStatus: jest.fn().mockResolvedValue(FAKE_DKIM_STATUS),
    rotateDkim: jest.fn().mockResolvedValue(FAKE_ROTATE_RESULT),
  };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CredentialRotationController],
      providers: [{ provide: CredentialRotationService, useValue: credentialServiceMock }],
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

  it('GET /credentials/dkim/:domainId → 200 con estado DKIM', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/credentials/dkim/${DOMAIN_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { selector: 'mail2026' } });
  });

  it('POST /credentials/rotate-dkim/:domainId → 201 con nuevo DKIM', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/credentials/rotate-dkim/${DOMAIN_ID}`)
      .send({})
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { selector: 'mail2027' } });
  });
});
