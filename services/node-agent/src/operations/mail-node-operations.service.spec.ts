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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let fsMock: typeof import('fs/promises');

  beforeEach(async () => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
});
