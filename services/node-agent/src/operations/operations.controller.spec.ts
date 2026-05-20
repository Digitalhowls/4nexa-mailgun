import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { Server } from 'http';
import { OperationsController } from './operations.controller';
import { MockOperationsService } from './mock-operations.service';
import { MailNodeOperationsService } from './mail-node-operations.service';
import { OPERATIONS_SERVICE } from './operations.interface';
import type { AgentEnvConfig } from '../config/env.schema';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
}));
jest.mock('child_process', () => ({
  exec: jest.fn((_c: string, _o: unknown, cb: (e: null, r: { stdout: string; stderr: string }) => void) =>
    cb(null, { stdout: '', stderr: '' }),
  ),
}));

// ─── Constantes ──────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-minimum-32-chars-ok!!';
const NODE_ID = '00000000-0000-0000-0000-000000000099';
const CORR_ID = '11111111-1111-1111-1111-111111111111';

const ENV_MAP: Record<string, unknown> = {
  AGENT_NODE_ID: NODE_ID,
  AGENT_MODE: 'mock',
  AGENT_JWT_SECRET: JWT_SECRET,
  AGENT_DKIM_ENCRYPTION_KEY: 'test-dkim-key-32-chars-minimum!!',
  AGENT_POSTFIX_VIRTUAL_DIR: '/tmp/test/postfix/virtual',
  AGENT_DOVECOT_USERS_FILE: '/tmp/test/dovecot/users.conf',
  AGENT_RSPAMD_DKIM_DIR: '/tmp/test/rspamd/dkim',
  AGENT_DOCKER_POSTFIX_CONTAINER: 'test-postfix',
  AGENT_DOCKER_DOVECOT_CONTAINER: 'test-dovecot',
  AGENT_DOCKER_RSPAMD_CONTAINER: 'test-rspamd',
  LOG_LEVEL: 'error',
};

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('OperationsController (integración HTTP)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      providers: [
        {
          provide: ConfigService,
          useValue: { get: (k: string) => ENV_MAP[k] } as unknown as ConfigService<AgentEnvConfig, true>,
        },
        MockOperationsService,
        MailNodeOperationsService,
        {
          provide: OPERATIONS_SERVICE,
          useFactory: (_cfg: unknown, mock: MockOperationsService) => mock,
          inject: [ConfigService, MockOperationsService, MailNodeOperationsService],
        },
      ],
      controllers: [OperationsController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwtService = module.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function makeToken(
    overrides: Partial<{ sub: string; iss: string; scope: string[] }> = {},
  ): string {
    return jwtService.sign({
      sub: NODE_ID,
      iss: 'control-plane',
      scope: ['apply_config', 'reload_service', 'health_check', 'backup_execute', 'metrics_report', 'queue_stats'],
      ...overrides,
    });
  }

  // ─── Sin token ──────────────────────────────────────────────────────────

  it('POST /operations → 401 sin token', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .send({});
    expect(res.status).toBe(401);
  });

  // ─── Token inválido ──────────────────────────────────────────────────────

  it('POST /operations → 401 con token mal firmado', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({});
    expect(res.status).toBe(401);
  });

  // ─── Estructura base inválida ────────────────────────────────────────────

  it('POST /operations → 400 con body vacío y token válido', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  // ─── health_check ────────────────────────────────────────────────────────

  it('POST /operations → 200 health_check', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'health_check',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: { deep: false },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.operation).toBe('health_check');
    expect(res.body.correlationId).toBe(CORR_ID);
    expect(res.body.data.services).toBeDefined();
  });

  // ─── metrics_report ──────────────────────────────────────────────────────

  it('POST /operations → 200 metrics_report', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'metrics_report',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: {},
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.smtp).toBeDefined();
    expect(res.body.data.system).toBeDefined();
  });

  // ─── apply_config ────────────────────────────────────────────────────────

  it('POST /operations → 200 apply_config', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'apply_config',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: {
          sections: [{ service: 'postfix', templateKey: 'virtual_domains', parameters: { domains: [] } }],
          reloadServices: [],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.appliedSections).toHaveLength(1);
  });

  // ─── reload_service ──────────────────────────────────────────────────────

  it('POST /operations → 200 reload_service', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'reload_service',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: { service: 'postfix' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('reloaded');
  });

  // ─── queue_stats ─────────────────────────────────────────────────────────

  it('POST /operations → 200 queue_stats', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'queue_stats',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: {},
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.activeQueue).toBe('number');
  });

  // ─── backup_execute ──────────────────────────────────────────────────────

  it('POST /operations → 200 backup_execute', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        operation: 'backup_execute',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: { type: 'full' },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.snapshotId).toBeDefined();
  });

  // ─── nodeId incorrecto en token ───────────────────────────────────────────

  it('POST /operations → 401 si nodeId del token no coincide con AGENT_NODE_ID', async () => {
    const wrongToken = makeToken({ sub: '99999999-9999-9999-9999-999999999999' });
    const res = await request(app.getHttpServer() as Server)
      .post('/operations')
      .set('Authorization', `Bearer ${wrongToken}`)
      .send({
        operation: 'health_check',
        nodeId: NODE_ID,
        correlationId: CORR_ID,
        payload: {},
      });
    expect(res.status).toBe(401);
  });
});
