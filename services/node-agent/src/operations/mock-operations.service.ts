import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as crypto from 'crypto';
import { createLogger } from '@4nexa/logger';
import type { AgentEnvConfig } from '../config/env.schema';
import type {
  AgentOperation,
  AgentResponse,
  ApplyConfigPayload,
  ApplyConfigResult,
  ReloadServicePayload,
  ReloadServiceResult,
  HealthCheckPayload,
  HealthCheckResult,
  BackupExecutePayload,
  BackupExecuteResult,
  MetricsReportPayload,
  MetricsReportResult,
  QueueStatsPayload,
  QueueStatsResult,
  ServiceName,
  ServiceHealthStatus,
} from '../contracts/agent.contracts';

const logger = createLogger({ service: 'node-agent' });

/**
 * Estado en memoria del mock. Simula el estado real de los servicios
 * del mail node para que el Control Plane pueda integrarse sin
 * necesitar Postfix/Dovecot/Rspamd instalados.
 */
interface MockState {
  configVersion: number;
  appliedConfigs: Map<string, { templateKey: string; parameters: Record<string, unknown>; appliedAt: string }>;
  serviceStatus: Map<ServiceName, { running: boolean; pid: number; startedAt: Date }>;
  smtpCounters: { sent: number; received: number; deferred: number; bounced: number; rejected: number };
  imapCounters: { connections: number; logins: number; failedLogins: number };
  deferredQueue: Array<{ id: string; from: string; to: string; size: number; arrivedAt: string; attempts: number }>;
  backups: Array<{ snapshotId: string; type: string; sizeBytes: number; createdAt: string }>;
}

@Injectable()
export class MockOperationsService {
  private readonly nodeId: string;
  private readonly state: MockState;
  private readonly startedAt: Date;

  constructor(private readonly config: ConfigService<AgentEnvConfig, true>) {
    this.nodeId = this.config.get('AGENT_NODE_ID');
    this.startedAt = new Date();

    // Estado inicial simulado: todos los servicios corriendo
    this.state = {
      configVersion: 1,
      appliedConfigs: new Map(),
      serviceStatus: new Map([
        ['postfix', { running: true, pid: 12340, startedAt: this.startedAt }],
        ['dovecot', { running: true, pid: 12341, startedAt: this.startedAt }],
        ['rspamd', { running: true, pid: 12342, startedAt: this.startedAt }],
      ]),
      smtpCounters: { sent: 0, received: 0, deferred: 0, bounced: 0, rejected: 0 },
      imapCounters: { connections: 0, logins: 0, failedLogins: 0 },
      deferredQueue: [],
      backups: [],
    };

    logger.info({ nodeId: this.nodeId }, 'Node Agent mock inicializado');
  }

  // ─── apply_config ────────────────────────────────────────────────────────────

  async applyConfig(payload: ApplyConfigPayload): Promise<ApplyConfigResult> {
    const appliedSections: string[] = [];

    for (const section of payload.sections) {
      const key = `${section.service}:${section.templateKey}`;
      this.state.appliedConfigs.set(key, {
        templateKey: section.templateKey,
        parameters: section.parameters,
        appliedAt: new Date().toISOString(),
      });
      appliedSections.push(key);
      logger.info(
        { nodeId: this.nodeId, service: section.service, templateKey: section.templateKey },
        'Sección de configuración aplicada (mock)',
      );
    }

    this.state.configVersion += 1;
    const configVersion = String(this.state.configVersion);

    // Simular reload de servicios si se solicita
    const reloadedServices: ServiceName[] = [];
    for (const svc of payload.reloadServices) {
      const current = this.state.serviceStatus.get(svc);
      if (current) {
        // Simular nuevo PID tras reload
        this.state.serviceStatus.set(svc, {
          running: true,
          pid: current.pid + 1,
          startedAt: new Date(),
        });
        reloadedServices.push(svc);
        logger.info({ nodeId: this.nodeId, service: svc }, 'Servicio recargado (mock)');
      }
    }

    return { appliedSections, reloadedServices, configVersion };
  }

  // ─── reload_service ──────────────────────────────────────────────────────────

  async reloadService(payload: ReloadServicePayload): Promise<ReloadServiceResult> {
    const current = this.state.serviceStatus.get(payload.service);

    if (!current || !current.running) {
      logger.warn({ nodeId: this.nodeId, service: payload.service }, 'Servicio no disponible para reload (mock)');
      return { service: payload.service, status: 'failed' };
    }

    const newPid = current.pid + 1;
    this.state.serviceStatus.set(payload.service, {
      running: true,
      pid: newPid,
      startedAt: new Date(),
    });

    logger.info(
      { nodeId: this.nodeId, service: payload.service, pid: newPid, reason: payload.reason },
      'Servicio recargado (mock)',
    );

    return { service: payload.service, status: 'reloaded', pid: newPid };
  }

  // ─── health_check ────────────────────────────────────────────────────────────

  async healthCheck(_payload: HealthCheckPayload): Promise<HealthCheckResult> {
    const now = Date.now();
    const uptimeSeconds = Math.floor((now - this.startedAt.getTime()) / 1000);

    const services: ServiceHealthStatus[] = [];

    for (const [name, status] of this.state.serviceStatus.entries()) {
      const svcUptimeSec = Math.floor((now - status.startedAt.getTime()) / 1000);
      services.push({
        name,
        running: status.running,
        pid: status.pid,
        uptimeSeconds: svcUptimeSec,
        // Valores realistas simulados
        memoryMb: Math.floor(50 + Math.random() * 100),
        cpuPercent: parseFloat((Math.random() * 5).toFixed(2)),
      });
    }

    // Sistema host real cuando está disponible, mock cuando no
    let loadAvg: [number, number, number];
    let diskFreeBytes: number;
    let diskUsedPercent: number;

    try {
      const rawLoad = os.loadavg();
      loadAvg = [rawLoad[0]!, rawLoad[1]!, rawLoad[2]!];
      // Disco: valores simulados para el mock
      diskFreeBytes = 50 * 1024 * 1024 * 1024; // 50 GB libres
      diskUsedPercent = 30 + Math.floor(Math.random() * 10);
    } catch {
      loadAvg = [0.1, 0.1, 0.1];
      diskFreeBytes = 50 * 1024 * 1024 * 1024;
      diskUsedPercent = 30;
    }

    const allRunning = services.every((s) => s.running);

    return {
      nodeId: this.nodeId,
      overallStatus: allRunning ? 'healthy' : 'degraded',
      services,
      diskUsedPercent,
      diskFreeBytes,
      loadAvg,
      uptimeSeconds,
    };
  }

  // ─── backup_execute ──────────────────────────────────────────────────────────

  async backupExecute(payload: BackupExecutePayload): Promise<BackupExecuteResult> {
    // Simular duración de backup (100–500 ms)
    const durationMs = 100 + Math.floor(Math.random() * 400);
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));

    const snapshotId = crypto.randomUUID();
    const sizeBytes =
      payload.type === 'full'
        ? 5 * 1024 * 1024 * 1024 // 5 GB
        : payload.type === 'mailboxes'
          ? 2 * 1024 * 1024 * 1024 // 2 GB
          : 100 * 1024 * 1024; // 100 MB

    const storagePath = payload.targetPath ?? `/backups/${this.nodeId}/${snapshotId}`;

    this.state.backups.push({
      snapshotId,
      type: payload.type,
      sizeBytes,
      createdAt: new Date().toISOString(),
    });

    logger.info(
      { nodeId: this.nodeId, snapshotId, type: payload.type, sizeBytes },
      'Backup ejecutado (mock)',
    );

    return { snapshotId, type: payload.type, sizeBytes, durationMs, storagePath };
  }

  // ─── metrics_report ──────────────────────────────────────────────────────────

  async metricsReport(_payload: MetricsReportPayload): Promise<MetricsReportResult> {
    // Incrementar contadores simulados para que los datos evolucionen
    this.state.smtpCounters.sent += Math.floor(Math.random() * 10);
    this.state.smtpCounters.received += Math.floor(Math.random() * 15);
    this.state.imapCounters.connections = Math.floor(Math.random() * 50);

    const totalMem = Math.floor(os.totalmem() / 1024 / 1024);
    const freeMem = Math.floor(os.freemem() / 1024 / 1024);

    return {
      nodeId: this.nodeId,
      period: {
        from: new Date(Date.now() - 60_000).toISOString(),
        to: new Date().toISOString(),
      },
      smtp: {
        sentTotal: this.state.smtpCounters.sent,
        receivedTotal: this.state.smtpCounters.received,
        deferredTotal: this.state.smtpCounters.deferred,
        bouncedTotal: this.state.smtpCounters.bounced,
        rejectedTotal: this.state.smtpCounters.rejected,
      },
      imap: {
        activeConnections: this.state.imapCounters.connections,
        loginTotal: this.state.imapCounters.logins,
        failedLoginTotal: this.state.imapCounters.failedLogins,
      },
      system: {
        cpuPercent: parseFloat((Math.random() * 20).toFixed(2)),
        memUsedMb: totalMem - freeMem,
        memTotalMb: totalMem,
        diskUsedBytes: 30 * 1024 * 1024 * 1024,
        diskTotalBytes: 100 * 1024 * 1024 * 1024,
      },
    };
  }

  // ─── queue_stats ─────────────────────────────────────────────────────────────

  async queueStats(_payload: QueueStatsPayload): Promise<QueueStatsResult> {
    return {
      nodeId: this.nodeId,
      activeQueue: Math.floor(Math.random() * 20),
      deferredQueue: this.state.deferredQueue.length,
      holdQueue: 0,
      activeEntries: [],
      deferredEntries: [...this.state.deferredQueue],
    };
  }

  // ─── Helpers para tests e introspección ──────────────────────────────────────

  getState(): Readonly<MockState> {
    return this.state;
  }

  buildResponse<T>(
    operation: AgentOperation,
    correlationId: string,
    startMs: number,
    data: T,
  ): AgentResponse<T> {
    return {
      success: true,
      correlationId,
      operation,
      nodeId: this.nodeId,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      data,
    };
  }

  buildErrorResponse(
    operation: AgentOperation,
    correlationId: string,
    startMs: number,
    error: string,
  ): AgentResponse<never> {
    return {
      success: false,
      correlationId,
      operation,
      nodeId: this.nodeId,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      error,
    };
  }
}
