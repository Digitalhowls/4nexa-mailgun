import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MockOperationsService } from './mock-operations.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NODE_ID = '00000000-0000-0000-0000-000000000001';

function buildConfigService(): ConfigService {
  return {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        AGENT_NODE_ID: NODE_ID,
        AGENT_MODE: 'mock',
        AGENT_JWT_SECRET: 'test-secret-32-chars-minimum-ok!!',
        AGENT_DKIM_ENCRYPTION_KEY: 'test-dkim-key-32-chars-minimum!!',
        LOG_LEVEL: 'error',
      };
      return map[key];
    },
  } as unknown as ConfigService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MockOperationsService', () => {
  let service: MockOperationsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MockOperationsService,
        { provide: ConfigService, useValue: buildConfigService() },
      ],
    }).compile();

    service = module.get(MockOperationsService);
  });

  // ─── apply_config ───────────────────────────────────────────────────────────

  describe('applyConfig()', () => {
    it('devuelve las secciones aplicadas y la versión de configuración', async () => {
      const result = await service.applyConfig({
        sections: [
          { service: 'postfix', templateKey: 'virtual_domains', parameters: { domains: ['example.com'] } },
          { service: 'dovecot', templateKey: 'users', parameters: { users: [] } },
        ],
        reloadServices: ['postfix'],
      });

      expect(result.appliedSections).toHaveLength(2);
      expect(result.appliedSections).toContain('postfix:virtual_domains');
      expect(result.appliedSections).toContain('dovecot:users');
      expect(result.reloadedServices).toEqual(['postfix']);
      expect(result.configVersion).toBe('2');
    });

    it('incrementa configVersion en cada llamada', async () => {
      await service.applyConfig({ sections: [{ service: 'rspamd', templateKey: 'dkim', parameters: {} }], reloadServices: [] });
      const result = await service.applyConfig({ sections: [{ service: 'rspamd', templateKey: 'dkim', parameters: {} }], reloadServices: [] });
      expect(parseInt(result.configVersion)).toBe(3);
    });
  });

  // ─── reload_service ─────────────────────────────────────────────────────────

  describe('reloadService()', () => {
    it('recarga postfix y devuelve status reloaded', async () => {
      const result = await service.reloadService({ service: 'postfix', reason: 'test' });
      expect(result.service).toBe('postfix');
      expect(result.status).toBe('reloaded');
      expect(result.pid).toBeGreaterThan(0);
    });

    it('recarga dovecot y rspamd sin error', async () => {
      const [d, r] = await Promise.all([
        service.reloadService({ service: 'dovecot' }),
        service.reloadService({ service: 'rspamd' }),
      ]);
      expect(d.status).toBe('reloaded');
      expect(r.status).toBe('reloaded');
    });
  });

  // ─── health_check ───────────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('incluye postfix, dovecot y rspamd en la respuesta', async () => {
      const result = await service.healthCheck({ deep: false });
      const names = result.services.map((s) => s.name);
      expect(names).toContain('postfix');
      expect(names).toContain('dovecot');
      expect(names).toContain('rspamd');
    });

    it('todos los servicios están running en el estado inicial', async () => {
      const result = await service.healthCheck({});
      result.services.forEach((s) => {
        expect(s.running).toBe(true);
      });
    });

    it('incluye métricas del sistema (uptime, loadAvg)', async () => {
      const result = await service.healthCheck({ deep: true });
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.loadAvg)).toBe(true);
      expect(result.loadAvg).toHaveLength(3);
    });
  });

  // ─── backup_execute ─────────────────────────────────────────────────────────

  describe('backupExecute()', () => {
    it('retorna snapshotId, sizeBytes y storagePath para backup full', async () => {
      const result = await service.backupExecute({ type: 'full' });
      expect(result.snapshotId).toBeTruthy();
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.storagePath).toBeTruthy();
      expect(result.type).toBe('full');
    });

    it('retorna snapshotId para backup incremental', async () => {
      const result = await service.backupExecute({ type: 'incremental' });
      expect(result.type).toBe('incremental');
      expect(result.snapshotId).toBeDefined();
    });
  });

  // ─── metrics_report ─────────────────────────────────────────────────────────

  describe('metricsReport()', () => {
    it('incluye smtp, imap y system en la respuesta', async () => {
      const result = await service.metricsReport({});
      expect(result.nodeId).toBe(NODE_ID);
      expect(result.smtp).toBeDefined();
      expect(result.imap).toBeDefined();
      expect(result.system).toBeDefined();
    });

    it('los campos smtp tienen los nombres correctos del contrato', async () => {
      const result = await service.metricsReport({});
      expect(typeof result.smtp.sentTotal).toBe('number');
      expect(typeof result.smtp.receivedTotal).toBe('number');
      expect(typeof result.smtp.deferredTotal).toBe('number');
      expect(typeof result.smtp.bouncedTotal).toBe('number');
      expect(typeof result.smtp.rejectedTotal).toBe('number');
    });

    it('periodo tiene from y to en formato ISO', async () => {
      const result = await service.metricsReport({});
      expect(() => new Date(result.period.from)).not.toThrow();
      expect(() => new Date(result.period.to)).not.toThrow();
    });
  });

  // ─── queue_stats ─────────────────────────────────────────────────────────────

  describe('queueStats()', () => {
    it('retorna activeQueue y deferredQueue como números', async () => {
      const result = await service.queueStats({});
      expect(result.nodeId).toBe(NODE_ID);
      expect(typeof result.activeQueue).toBe('number');
      expect(typeof result.deferredQueue).toBe('number');
    });
  });

  // ─── buildResponse / buildErrorResponse ────────────────────────────────────

  describe('buildResponse()', () => {
    it('construye un AgentResponse válido', () => {
      const startMs = Date.now() - 100;
      const resp = service.buildResponse('health_check', 'corr-123', startMs, { ok: true });
      expect(resp.success).toBe(true);
      expect(resp.operation).toBe('health_check');
      expect(resp.correlationId).toBe('corr-123');
      expect(resp.nodeId).toBe(NODE_ID);
      expect(resp.durationMs).toBeGreaterThanOrEqual(100);
      expect(resp.data).toEqual({ ok: true });
    });
  });

  describe('buildErrorResponse()', () => {
    it('construye un AgentResponse de error válido', () => {
      const resp = service.buildErrorResponse('reload_service', 'corr-456', Date.now(), 'algo falló');
      expect(resp.success).toBe(false);
      expect(resp.error).toBe('algo falló');
      expect(resp.data).toBeUndefined();
    });
  });
});
