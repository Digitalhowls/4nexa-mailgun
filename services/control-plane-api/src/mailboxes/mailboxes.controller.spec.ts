import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { MailboxesController } from './mailboxes.controller';
import { MailboxesService } from './mailboxes.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@4nexa/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID  = 'aaaa0000-0000-0000-0000-000000000001';
const DOMAIN_ID  = 'bbbb0000-0000-0000-0000-000000000001';
const MAILBOX_ID = 'cccc0000-0000-0000-0000-000000000001';

const FAKE_MAILBOX = {
  id: MAILBOX_ID,
  tenantId: TENANT_ID,
  domainId: DOMAIN_ID,
  localPart: 'admin',
  email: 'admin@empresa.com',
  active: true,
  deletedAt: null,
};

const FAKE_PAGE = { items: [FAKE_MAILBOX], total: 1, page: 1, pageSize: 20 };
const FAKE_QUOTA = { usedBytes: 1048576, limitBytes: 536870912, percentUsed: 0.19 };
const FAKE_RESET = { mailbox: FAKE_MAILBOX };

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('MailboxesController (HTTP)', () => {
  let app: INestApplication;

  const mailboxesServiceMock = {
    create: jest.fn().mockResolvedValue(FAKE_MAILBOX),
    findAll: jest.fn().mockResolvedValue(FAKE_PAGE),
    findOne: jest.fn().mockResolvedValue(FAKE_MAILBOX),
    update: jest.fn().mockResolvedValue(FAKE_MAILBOX),
    resetPassword: jest.fn().mockResolvedValue(FAKE_RESET),
    getQuotaInfo: jest.fn().mockResolvedValue(FAKE_QUOTA),
    softDelete: jest.fn().mockResolvedValue(FAKE_MAILBOX),
  };

  const auditMock = { log: jest.fn().mockResolvedValue(undefined) };

  const adminUser = {
    sub: 'admin-id',
    email: 'admin@4nexa.io',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailboxesController],
      providers: [
        { provide: MailboxesService, useValue: mailboxesServiceMock },
        { provide: AuditService, useValue: auditMock },
      ],
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

  it('POST /mailboxes → 201 con buzón creado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/mailboxes')
      .send({
        tenantId: TENANT_ID,
        domainId: DOMAIN_ID,
        localPart: 'admin',
        password: 'Correo2026!Seg',
      })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, data: { id: MAILBOX_ID } });
  });

  it('GET /mailboxes → 200 con lista paginada', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/mailboxes')
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { total: 1 } });
  });

  it('GET /mailboxes/:id → 200 con buzón', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/mailboxes/${MAILBOX_ID}`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { id: MAILBOX_ID } });
  });

  it('PATCH /mailboxes/:id → 200 con buzón actualizado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch(`/mailboxes/${MAILBOX_ID}`)
      .send({ active: false })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('POST /mailboxes/:id/reset-password → 200 con resultado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/mailboxes/${MAILBOX_ID}/reset-password`)
      .send({ newPassword: 'NuevaS3gur0!2026' })
      .expect(200);

    expect(res.body).toMatchObject({ success: true });
  });

  it('GET /mailboxes/:id/quota → 200 con cuota', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/mailboxes/${MAILBOX_ID}/quota`)
      .expect(200);

    expect(res.body).toMatchObject({ success: true, data: { percentUsed: 0.19 } });
  });

  it('DELETE /mailboxes/:id → 204 sin cuerpo', async () => {
    await request(app.getHttpServer() as Server)
      .delete(`/mailboxes/${MAILBOX_ID}`)
      .expect(204);
  });
});
