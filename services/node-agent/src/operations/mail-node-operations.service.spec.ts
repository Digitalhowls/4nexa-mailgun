import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MailNodeOperationsService } from './mail-node-operations.service';

// ─── Mocks de módulos Node.js ─────────────────────────────────────────────────

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
}));

jest.mock('child_process', () => ({
  exec: jest.fn((_cmd: string, _opts: unknown, callback: (e: null, r: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout: '', stderr: '' });
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODE_ID = '00000000-0000-0000-0000-000000000002';
const DKIM_KEY = 'test-dkim-key-32-chars-minimum!!';

function buildConfigService(): ConfigService {
  return {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        AGENT_NODE_ID: NODE_ID,
        AGENT_MODE: 'docker',
        AGENT_JWT_SECRET: 'test-secret-32-chars-minimum-ok!!',
        AGENT_DKIM_ENCRYPTION_KEY: DKIM_KEY,
        AGENT_POSTFIX_VIRTUAL_DIR: '/tmp/test/postfix/virtual',
        AGENT_DOVECOT_USERS_FILE: '/tmp/test/dovecot/users.conf',
        AGENT_RSPAMD_DKIM_DIR: '/tmp/test/rspamd/dkim',
        AGENT_DOCKER_POSTFIX_CONTAINER: 'test-postfix',
        AGENT_DOCKER_DOVECOT_CONTAINER: 'test-dovecot',
        AGENT_DOCKER_RSPAMD_CONTAINER: 'test-rspamd',
        LOG_LEVEL: 'error',
      };
      return map[key];
    },
  } as unknown as ConfigService;
}

/** Cifra una cadena con AES-256-GCM usando el mismo algoritmo que el Control Plane */
function encryptDkimKey(plaintext: string): string {
  const key = crypto.createHash('sha256').update(DKIM_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MailNodeOperationsService', () => {
  let service: MailNodeOperationsService;
   
  let fsMock: typeof import('fs/promises');

  beforeEach(async () => {
    jest.clearAllMocks();
     
    fsMock = require('fs/promises') as typeof import('fs/promises');

    const module = await Test.createTestingModule({
      providers: [
        MailNodeOperationsService,
        { provide: ConfigService, useValue: buildConfigService() },
      ],
    }).compile();

    service = module.get(MailNodeOperationsService);
  });

  // ─── apply_config → postfix virtual_domains ────────────────────────────────

  describe('applyConfig() → postfix virtual_domains', () => {
    it('escribe el archivo domains en el directorio postfix', async () => {
      await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'virtual_domains',
            parameters: { virtualDomains: ['example.com', 'test.org'] },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('domains'),
        expect.stringContaining('example.com'),
        'utf8',
      );
    });

    it('retorna la clave aplicada en appliedSections', async () => {
      const result = await service.applyConfig({
        sections: [{ service: 'postfix', templateKey: 'virtual_domains', parameters: { virtualDomains: [] } }],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('postfix:virtual_domains');
    });
  });

  // ─── apply_config → postfix virtual_mailboxes ──────────────────────────────

  describe('applyConfig() → postfix virtual_mailboxes', () => {
    it('escribe el archivo mailboxes y ejecuta postmap', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

      await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'virtual_mailboxes',
            parameters: {
              virtualMailboxes: [{ address: 'user@example.com', maildir: 'example.com/user/' }],
            },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('mailboxes'),
        expect.stringContaining('user@example.com'),
        'utf8',
      );
      // postmap se ejecuta vía docker exec en modo docker
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('postmap'),
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  // ─── apply_config → dovecot users ─────────────────────────────────────────

  describe('applyConfig() → dovecot users', () => {
    it('escribe users.conf en formato passwd-file', async () => {
      await service.applyConfig({
        sections: [
          {
            service: 'dovecot',
            templateKey: 'users',
            parameters: {
              users: [
                {
                  username: 'alice@example.com',
                  passwordHash: '{ARGON2ID}hash',
                  quotaBytes: '1073741824',
                  homeDir: '/var/mail/example.com/alice',
                },
              ],
            },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('users.conf'),
        expect.stringContaining('alice@example.com:{ARGON2ID}hash'),
        expect.objectContaining({ encoding: 'utf8', mode: 0o600 }),
      );
    });
  });

  // ─── apply_config → DKIM decryption ───────────────────────────────────────

  describe('DKIM key decryption', () => {
    it('descifra correctamente una clave AES-256-GCM y la escribe', async () => {
      const privatePem = '-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----';
      const encrypted = encryptDkimKey(privatePem);

      await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'dkim_keys',
            parameters: {
              dkimEntries: [
                { domain: 'example.com', selector: 'mail', privateKeyEncrypted: encrypted },
              ],
            },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('mail.example.com.key'),
        privatePem,
        expect.objectContaining({ mode: 0o600 }),
      );
    });

    it('lanza error si el formato cifrado no tiene 3 partes', async () => {
      await expect(
        service.applyConfig({
          sections: [
            {
              service: 'postfix',
              templateKey: 'dkim_keys',
              parameters: {
                dkimEntries: [{ domain: 'x.com', selector: 's', privateKeyEncrypted: 'mal:formato' }],
              },
            },
          ],
          reloadServices: [],
        }),
      ).rejects.toThrow('Formato de clave DKIM cifrada inválido');
    });
  });

  // ─── reload_service ────────────────────────────────────────────────────────

  describe('reloadService()', () => {
    it('construye el comando docker exec correcto para postfix', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

      const result = await service.reloadService({ service: 'postfix' });

      expect(result.service).toBe('postfix');
      expect(result.status).toBe('reloaded');
      expect(exec).toHaveBeenCalledWith(
        'docker exec test-postfix postfix reload',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('devuelve status failed si el comando falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_cmd: string, _opts: unknown, cb: (e: Error) => void) => cb(new Error('connection refused')),
      );

      const result = await service.reloadService({ service: 'rspamd' });
      expect(result.status).toBe('failed');
    });
  });

  // ─── health_check ──────────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('incluye los 3 servicios en la respuesta', async () => {
      const result = await service.healthCheck({ deep: false });
      const names = result.services.map((s) => s.name);
      expect(names).toContain('postfix');
      expect(names).toContain('dovecot');
      expect(names).toContain('rspamd');
    });

    it('incluye métricas de sistema (uptime, loadAvg)', async () => {
      const result = await service.healthCheck({});
      expect(result.uptimeSeconds).toBeGreaterThan(0);
      expect(Array.isArray(result.loadAvg)).toBe(true);
    });
  });

  // ─── buildResponse / buildErrorResponse ────────────────────────────────────

  describe('buildResponse()', () => {
    it('construye una respuesta exitosa con los campos obligatorios', () => {
      const resp = service.buildResponse('apply_config', 'corr-001', Date.now() - 50, { ok: 1 });
      expect(resp.success).toBe(true);
      expect(resp.nodeId).toBe(NODE_ID);
      expect(resp.operation).toBe('apply_config');
      expect(resp.durationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('buildErrorResponse()', () => {
    it('construye una respuesta de error', () => {
      const resp = service.buildErrorResponse('backup_execute', 'corr-002', Date.now(), 'restic not found');
      expect(resp.success).toBe(false);
      expect(resp.error).toBe('restic not found');
    });
  });

  // ─── apply_config → reloadServices ────────────────────────────────────────

  describe('applyConfig() → reloadServices no vacío', () => {
    it('incluye el servicio en reloadedServices si el reload tiene éxito', async () => {
      const result = await service.applyConfig({
        sections: [
          { service: 'postfix', templateKey: 'virtual_domains', parameters: { virtualDomains: [] } },
        ],
        reloadServices: ['postfix'],
      });
      expect(result.reloadedServices).toContain('postfix');
    });

    it('NO incluye el servicio en reloadedServices si el reload falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('postfix no disponible')),
      );

      const result = await service.applyConfig({
        sections: [],
        reloadServices: ['dovecot'],
      });
      expect(result.reloadedServices).not.toContain('dovecot');
    });
  });

  // ─── apply_config → postfix virtual_aliases ────────────────────────────────

  describe('applyConfig() → postfix virtual_aliases', () => {
    it('escribe el archivo aliases y ejecuta postmap', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

      await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'virtual_aliases',
            parameters: {
              virtualAliases: [
                { source: 'alias@example.com', destination: 'real@example.com' },
              ],
            },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('aliases'),
        expect.stringContaining('alias@example.com'),
        'utf8',
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('postmap'),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('aplica virtual_aliases vacío sin error', async () => {
      const result = await service.applyConfig({
        sections: [
          { service: 'postfix', templateKey: 'virtual_aliases', parameters: { virtualAliases: [] } },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('postfix:virtual_aliases');
    });
  });

  // ─── apply_config → postfix templateKey desconocido ───────────────────────

  describe('applyConfig() → postfix templateKey desconocido', () => {
    it('aplica sin error con templateKey desconocido (default case)', async () => {
      const result = await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'unknown_key_xyz',
            parameters: {},
          },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('postfix:unknown_key_xyz');
    });
  });

  // ─── apply_config → execPostmap fallo ─────────────────────────────────────

  describe('applyConfig() → execPostmap fallo ignorado', () => {
    it('continúa aunque postmap falle', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_cmd: string, _opts: unknown, cb: (e: Error) => void) => cb(new Error('postmap not found')),
      );

      const result = await service.applyConfig({
        sections: [
          {
            service: 'postfix',
            templateKey: 'virtual_mailboxes',
            parameters: { virtualMailboxes: [{ address: 'u@x.com', maildir: 'x.com/u/' }] },
          },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('postfix:virtual_mailboxes');
    });
  });

  // ─── apply_config → dovecot templateKey desconocido ───────────────────────

  describe('applyConfig() → dovecot templateKey desconocido', () => {
    it('aplica sin error con templateKey desconocido (default case dovecot)', async () => {
      const result = await service.applyConfig({
        sections: [
          {
            service: 'dovecot',
            templateKey: 'unknown_dovecot_key',
            parameters: {},
          },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('dovecot:unknown_dovecot_key');
    });
  });

  // ─── apply_config → rspamd dkim_signing ───────────────────────────────────

  describe('applyConfig() → rspamd dkim_signing', () => {
    it('escribe las claves privadas y el archivo dkim_signing_auto.conf', async () => {
      const privatePem = '-----BEGIN RSA PRIVATE KEY-----\nFAKEKEY\n-----END RSA PRIVATE KEY-----';
      const encrypted = encryptDkimKey(privatePem);

      await service.applyConfig({
        sections: [
          {
            service: 'rspamd',
            templateKey: 'dkim_signing',
            parameters: {
              dkimDomains: [
                { domain: 'example.com', selector: 'mail2024', privateKeyEncrypted: encrypted },
              ],
            },
          },
        ],
        reloadServices: [],
      });

      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('mail2024.example.com.key'),
        privatePem,
        expect.objectContaining({ mode: 0o600 }),
      );
      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dkim_signing_auto.conf'),
        expect.stringContaining('example.com'),
        'utf8',
      );
    });

    it('aplica rspamd dkim_signing con lista vacía sin error', async () => {
      const result = await service.applyConfig({
        sections: [
          {
            service: 'rspamd',
            templateKey: 'dkim_signing',
            parameters: { dkimDomains: [] },
          },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('rspamd:dkim_signing');
    });
  });

  // ─── apply_config → rspamd templateKey desconocido ────────────────────────

  describe('applyConfig() → rspamd templateKey desconocido', () => {
    it('aplica sin error con templateKey desconocido', async () => {
      const result = await service.applyConfig({
        sections: [
          {
            service: 'rspamd',
            templateKey: 'unknown_rspamd_key',
            parameters: {},
          },
        ],
        reloadServices: [],
      });
      expect(result.appliedSections).toContain('rspamd:unknown_rspamd_key');
    });
  });

  // ─── healthCheck → deep: true ─────────────────────────────────────────────

  describe('healthCheck() → deep: true', () => {
    it('ejecuta df y retorna diskFreeBytes y diskUsedPercent reales', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      // docker inspect × 3 servicios + df × 1
      exec
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '1234' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '5678' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '9012' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '5368709120 45%' }),
        );

      const result = await service.healthCheck({ deep: true });
      expect(result.diskUsedPercent).toBe(45);
      expect(result.diskFreeBytes).toBe(5368709120);
    });

    it('usa freemem si df falla en modo deep', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      // 3 docker inspect OK + df falla
      exec
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '111' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '222' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '333' }),
        )
        .mockImplementationOnce((_: string, _o: unknown, cb: (e: Error) => void) =>
          cb(new Error('df not found')),
        );

      const result = await service.healthCheck({ deep: true });
      expect(result.diskFreeBytes).toBeGreaterThan(0);
    });
  });

  // ─── healthCheck → getServiceHealth catch ─────────────────────────────────

  describe('healthCheck() → getServiceHealth fallo', () => {
    it('retorna running: false si docker inspect falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementation(
        (_cmd: string, _opts: unknown, cb: (e: Error) => void) => cb(new Error('docker not available')),
      );

      const result = await service.healthCheck({ deep: false });
      expect(result.services.every((s) => s.running === false)).toBe(true);
      expect(result.overallStatus).toBe('unhealthy');
    });
  });

  // ─── backupExecute ─────────────────────────────────────────────────────────

  describe('backupExecute()', () => {
    it('ejecuta backup de config y retorna snapshotId y sizeBytes', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '{"total_bytes_processed":2048}' }),
      );

      const result = await service.backupExecute({
        type: 'config',
        targetPath: '/backups/test',
      });

      expect(result.snapshotId).toBeTruthy();
      expect(result.type).toBe('config');
      expect(result.sizeBytes).toBe(2048);
      expect(result.storagePath).toBe('/backups/test');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('ejecuta backup de mailboxes (type: mailbox)', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '{"total_bytes_processed":4096}' }),
      );

      const result = await service.backupExecute({ type: 'mailboxes' });
      expect(result.type).toBe('mailboxes');
      expect(result.sizeBytes).toBe(4096);
    });

    it('retorna sizeBytes 0 si restic falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('restic not found')),
      );

      const result = await service.backupExecute({ type: 'config' });
      expect(result.sizeBytes).toBe(0);
    });

    it('usa targetPath por defecto si no se especifica', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '{"total_bytes_processed":0}' }),
      );

      const result = await service.backupExecute({ type: 'config' });
      expect(result.storagePath).toContain('backups');
    });
  });

  // ─── metricsReport ────────────────────────────────────────────────────────

  describe('metricsReport()', () => {
    it('retorna métricas de sistema con nodeId correcto', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      // parsePostfixMetrics se ejecuta PRIMERO (docker logs), luego df
      exec
        .mockImplementationOnce(
          (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
            cb(null, {
              stdout: [
                'Jun 01 10:00:00 host postfix/smtp[1]: ABC: status=sent',
                'Jun 01 10:00:01 host postfix/smtp[2]: DEF: status=deferred',
                'Jun 01 10:00:02 host postfix/smtp[3]: GHI: status=bounced',
                'Jun 01 10:00:03 host postfix/smtp[4]: JKL: NOQUEUE: reject',
                'Jun 01 10:00:04 host postfix/smtp[5]: MNO: message-id=<id@host> from=<sender@x.com>',
              ].join('\n'),
            }),
        )
        .mockImplementationOnce(
          (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
            cb(null, { stdout: '1073741824 10737418240' }),
        );

      const result = await service.metricsReport({});
      expect(result.nodeId).toBe(NODE_ID);
      expect(result.smtp).toBeDefined();
      expect(result.system.memTotalMb).toBeGreaterThan(0);
    });

    it('retorna diskUsedBytes 0 si df falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec
        .mockImplementationOnce(
          (_: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('logs unavailable')),
        )
        .mockImplementationOnce(
          (_: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('df unavailable')),
        );

      const result = await service.metricsReport({});
      expect(result.system.diskUsedBytes).toBe(0);
    });
  });

  // ─── queueStats ───────────────────────────────────────────────────────────

  describe('queueStats()', () => {
    it('parsea la salida de mailq y cuenta cola activa y diferida', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      const mailqOutput = [
        'Mail queue is empty',
        'A1B2C3D4E5F 1234 Fri Jan  1 00:00:00  sender@example.com',
        'B2C3D4E5F6A  456 Fri Jan  1 00:00:00  (connect to) deferred@example.com',
        'C3D4E5F6A7B  789 Fri Jan  1 00:00:00  (deferred) hold@example.com',
      ].join('\n');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: mailqOutput }),
      );

      const result = await service.queueStats({});
      expect(result.nodeId).toBe(NODE_ID);
      expect(result.activeQueue).toBeGreaterThanOrEqual(0);
      expect(result.deferredQueue).toBeGreaterThanOrEqual(0);
    });

    it('retorna colas en 0 si mailq falla', async () => {
      const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
      exec.mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: Error) => void) => cb(new Error('mailq not found')),
      );

      const result = await service.queueStats({});
      expect(result.activeQueue).toBe(0);
      expect(result.deferredQueue).toBe(0);
    });
  });
});

// ─── Suite modo native ────────────────────────────────────────────────────────

describe('MailNodeOperationsService (mode: native)', () => {
  let nativeService: MailNodeOperationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Restaurar la implementación por defecto (podría haber sido sobreescrita por tests anteriores)
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
    exec.mockImplementation(
      (_cmd: string, _opts: unknown, cb: (e: null, r: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: '', stderr: '' }),
    );

    const nativeConfig = {
      get: (key: string) => {
        const map: Record<string, unknown> = {
          AGENT_NODE_ID: 'native-node-001',
          AGENT_MODE: 'native',
          AGENT_JWT_SECRET: 'test-secret-32-chars-minimum-ok!!',
          AGENT_DKIM_ENCRYPTION_KEY: DKIM_KEY,
          AGENT_POSTFIX_VIRTUAL_DIR: '/tmp/test/postfix/virtual',
          AGENT_DOVECOT_USERS_FILE: '/tmp/test/dovecot/users.conf',
          AGENT_RSPAMD_DKIM_DIR: '/tmp/test/rspamd/dkim',
          AGENT_DOCKER_POSTFIX_CONTAINER: '',
          AGENT_DOCKER_DOVECOT_CONTAINER: '',
          AGENT_DOCKER_RSPAMD_CONTAINER: '',
          LOG_LEVEL: 'error',
        };
        return map[key];
      },
    } as unknown as ConfigService;

    const module = await Test.createTestingModule({
      providers: [
        MailNodeOperationsService,
        { provide: ConfigService, useValue: nativeConfig },
      ],
    }).compile();

    nativeService = module.get(MailNodeOperationsService);
  });

  it('reloadService usa comando nativo (sin docker exec)', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

    const result = await nativeService.reloadService({ service: 'postfix' });
    expect(result.status).toBe('reloaded');
    expect(exec).toHaveBeenCalledWith(
      'postfix reload',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('reloadService native: dovecot usa doveadm reload', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

    const result = await nativeService.reloadService({ service: 'dovecot' });
    expect(result.status).toBe('reloaded');
    expect(exec).toHaveBeenCalledWith(
      'doveadm reload',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('reloadService native: rspamd usa rspamd reload', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');

    const result = await nativeService.reloadService({ service: 'rspamd' });
    expect(result.status).toBe('reloaded');
    expect(exec).toHaveBeenCalledWith(
      'rspamd reload',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('healthCheck native usa pgrep en lugar de docker inspect', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
    exec.mockImplementation(
      (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
        cb(null, { stdout: '1234' }),
    );

    const result = await nativeService.healthCheck({ deep: false });
    const postfixCall = (exec as jest.Mock).mock.calls.find(
      (c: string[]) => c[0]?.includes('pgrep') && c[0]?.includes('postfix'),
    );
    expect(postfixCall).toBeTruthy();
    expect(result.services.length).toBe(3);
  });

  it('backupExecute native usa restic directo', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
    exec.mockImplementationOnce(
      (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
        cb(null, { stdout: '{"total_bytes_processed":512}' }),
    );

    const result = await nativeService.backupExecute({ type: 'config', targetPath: '/backups/native' });
    expect(result.sizeBytes).toBe(512);
    const cmd = (exec as jest.Mock).mock.calls[0]?.[0] as string;
    expect(cmd).not.toContain('docker');
    expect(cmd).toContain('restic');
  });

  it('queueStats native usa mailq directo', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
    exec.mockImplementationOnce(
      (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
        cb(null, { stdout: 'Mail queue is empty' }),
    );

    const result = await nativeService.queueStats({});
    const cmd = (exec as jest.Mock).mock.calls[0]?.[0] as string;
    expect(cmd).not.toContain('docker');
    expect(result.nodeId).toBe('native-node-001');
  });

  it('metricsReport native usa journalctl en lugar de docker logs', async () => {
    const { exec } = jest.requireMock<{ exec: jest.Mock }>('child_process');
    exec
      .mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, { stdout: '2147483648 21474836480' }),
      )
      .mockImplementationOnce(
        (_: string, _o: unknown, cb: (e: null, r: { stdout: string }) => void) =>
          cb(null, {
            stdout: [
              'Jun 01 10:00:00 host postfix/smtp[1]: ABC: status=sent',
              'Jun 01 10:00:01 host postfix/smtp[2]: DEF: status=bounced',
              'Jun 01 10:00:02 host postfix/smtp[3]: GHI: NOQUEUE: reject',
              'Jun 01 10:00:03 host postfix/smtp[4]: JKL: message-id=<id@host> from=<sender@x.com>',
            ].join('\n'),
          }),
      );

    const result = await nativeService.metricsReport({});
    expect(result.nodeId).toBe('native-node-001');
    expect(result.smtp.sentTotal).toBeGreaterThanOrEqual(0);
    const logCmd = (exec as jest.Mock).mock.calls[1]?.[0] as string;
    expect(logCmd).not.toContain('docker logs');
  });
});
