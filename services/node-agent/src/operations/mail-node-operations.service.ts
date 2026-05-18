import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
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
import type { IOperationsService } from './operations.interface';

const execAsync = promisify(exec);
const logger = createLogger({ service: 'node-agent' });

@Injectable()
export class MailNodeOperationsService implements IOperationsService {
  private readonly nodeId: string;
  private readonly mode: 'docker' | 'native';
  private readonly postfixVirtualDir: string;
  private readonly dovecotUsersFile: string;
  private readonly rspamdDkimDir: string;
  private readonly dockerContainers: Record<ServiceName, string>;
  private readonly dkimEncryptionKey: string;

  constructor(private readonly config: ConfigService<AgentEnvConfig, true>) {
    this.nodeId = this.config.get('AGENT_NODE_ID');
    // AGENT_MODE puede ser 'mock' | 'docker' | 'native'; en este servicio
    // solo se usa cuando es 'docker' o 'native'
    const mode = this.config.get('AGENT_MODE');
    this.mode = mode === 'native' ? 'native' : 'docker';
    this.postfixVirtualDir = this.config.get('AGENT_POSTFIX_VIRTUAL_DIR');
    this.dovecotUsersFile = this.config.get('AGENT_DOVECOT_USERS_FILE');
    this.rspamdDkimDir = this.config.get('AGENT_RSPAMD_DKIM_DIR');
    this.dkimEncryptionKey = this.config.get('AGENT_DKIM_ENCRYPTION_KEY');
    this.dockerContainers = {
      postfix: this.config.get('AGENT_DOCKER_POSTFIX_CONTAINER'),
      dovecot: this.config.get('AGENT_DOCKER_DOVECOT_CONTAINER'),
      rspamd: this.config.get('AGENT_DOCKER_RSPAMD_CONTAINER'),
    };

    logger.info({ nodeId: this.nodeId, mode: this.mode }, 'MailNodeOperationsService inicializado');
  }

  // ─── apply_config ─────────────────────────────────────────────────────────

  async applyConfig(payload: ApplyConfigPayload): Promise<ApplyConfigResult> {
    const appliedSections: string[] = [];

    for (const section of payload.sections) {
      const key = `${section.service}:${section.templateKey}`;
      await this.writeSectionConfig(section.service, section.templateKey, section.parameters);
      appliedSections.push(key);
      logger.info(
        { nodeId: this.nodeId, service: section.service, templateKey: section.templateKey },
        'Sección de configuración aplicada',
      );
    }

    const reloadedServices: ServiceName[] = [];
    for (const svc of payload.reloadServices) {
      const result = await this.execReloadInternal(svc);
      if (result.status === 'reloaded') {
        reloadedServices.push(svc);
      }
    }

    return {
      appliedSections,
      reloadedServices,
      configVersion: String(Date.now()),
    };
  }

  private async writeSectionConfig(
    service: ServiceName,
    templateKey: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    switch (service) {
      case 'postfix':
        await this.writePostfixSection(templateKey, params);
        break;
      case 'dovecot':
        await this.writeDovecotSection(templateKey, params);
        break;
      case 'rspamd':
        await this.writeRspamdSection(templateKey, params);
        break;
    }
  }

  // ─── Postfix ──────────────────────────────────────────────────────────────

  private async writePostfixSection(
    templateKey: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await fs.mkdir(this.postfixVirtualDir, { recursive: true });

    switch (templateKey) {
      case 'virtual_domains': {
        const domains = (params['virtualDomains'] as string[]) ?? [];
        const content = domains.join('\n') + '\n';
        await fs.writeFile(path.join(this.postfixVirtualDir, 'domains'), content, 'utf8');
        logger.debug({ count: domains.length }, 'Postfix: virtual_domains escrito');
        break;
      }
      case 'virtual_mailboxes': {
        const mailboxes =
          (params['virtualMailboxes'] as Array<{ address: string; maildir: string }>) ?? [];
        const lines = mailboxes.map((m) => `${m.address}  ${m.maildir}`);
        const content = lines.join('\n') + '\n';
        const filePath = path.join(this.postfixVirtualDir, 'mailboxes');
        await fs.writeFile(filePath, content, 'utf8');
        await this.execPostmap(filePath);
        logger.debug({ count: mailboxes.length }, 'Postfix: virtual_mailboxes escrito');
        break;
      }
      case 'virtual_aliases': {
        const aliases =
          (params['virtualAliases'] as Array<{ source: string; destination: string }>) ?? [];
        const lines = aliases.map((a) => `${a.source}  ${a.destination}`);
        const content = lines.join('\n') + '\n';
        const filePath = path.join(this.postfixVirtualDir, 'aliases');
        await fs.writeFile(filePath, content, 'utf8');
        await this.execPostmap(filePath);
        logger.debug({ count: aliases.length }, 'Postfix: virtual_aliases escrito');
        break;
      }
      case 'dkim_keys': {
        const entries =
          (params['dkimEntries'] as Array<{
            domain: string;
            selector: string;
            privateKeyEncrypted: string;
          }>) ?? [];
        await fs.mkdir(this.rspamdDkimDir, { recursive: true });
        for (const entry of entries) {
          const privateKeyPem = this.decryptDkimKey(entry.privateKeyEncrypted);
          const keyPath = path.join(
            this.rspamdDkimDir,
            `${entry.selector}.${entry.domain}.key`,
          );
          await fs.writeFile(keyPath, privateKeyPem, { encoding: 'utf8', mode: 0o600 });
        }
        logger.debug({ count: entries.length }, 'DKIM: claves escritas');
        break;
      }
      default:
        logger.warn({ templateKey }, 'Postfix: templateKey desconocido');
    }
  }

  private async execPostmap(filePath: string): Promise<void> {
    const baseName = path.basename(filePath);
    const cmd =
      this.mode === 'docker'
        ? `docker exec ${this.dockerContainers.postfix} postmap /etc/postfix/virtual/${baseName}`
        : `postmap ${filePath}`;
    try {
      await execAsync(cmd, { timeout: 15_000 });
    } catch (err) {
      logger.warn({ filePath, err }, 'postmap falló (mapa vacío o postfix no disponible)');
    }
  }

  // ─── Dovecot ──────────────────────────────────────────────────────────────

  private async writeDovecotSection(
    templateKey: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    switch (templateKey) {
      case 'users': {
        const users =
          (params['users'] as Array<{
            username: string;
            passwordHash: string;
            quotaBytes: string;
            homeDir: string;
          }>) ?? [];
        // Formato passwd-file Dovecot:
        // usuario@dom:{ARGON2ID}hash:::::userdb_quota_rule=*:bytes=N
        const lines = users.map(
          (u) =>
            `${u.username}:${u.passwordHash}:::::userdb_quota_rule=*:bytes=${u.quotaBytes}`,
        );
        const content = lines.join('\n') + '\n';
        await fs.mkdir(path.dirname(this.dovecotUsersFile), { recursive: true });
        await fs.writeFile(this.dovecotUsersFile, content, { encoding: 'utf8', mode: 0o600 });
        logger.debug({ count: users.length }, 'Dovecot: users.conf escrito');
        break;
      }
      default:
        logger.warn({ templateKey }, 'Dovecot: templateKey desconocido');
    }
  }

  // ─── Rspamd ───────────────────────────────────────────────────────────────

  private async writeRspamdSection(
    templateKey: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await fs.mkdir(this.rspamdDkimDir, { recursive: true });

    switch (templateKey) {
      case 'dkim_signing': {
        const dkimDomains =
          (params['dkimDomains'] as Array<{
            domain: string;
            selector: string;
            privateKeyEncrypted: string;
          }>) ?? [];

        // Escribir claves privadas
        for (const entry of dkimDomains) {
          const privateKeyPem = this.decryptDkimKey(entry.privateKeyEncrypted);
          const keyPath = path.join(
            this.rspamdDkimDir,
            `${entry.selector}.${entry.domain}.key`,
          );
          await fs.writeFile(keyPath, privateKeyPem, { encoding: 'utf8', mode: 0o600 });
        }

        // Generar configuración dkim_signing dinámica
        const domainEntries = dkimDomains
          .map(
            (d) =>
              `  "${d.domain}" {\n` +
              `    selector = "${d.selector}";\n` +
              `    path = "/etc/rspamd/dkim/${d.selector}.${d.domain}.key";\n` +
              `  }`,
          )
          .join('\n');

        const signingConf =
          `# Generado automáticamente por node-agent — NO EDITAR MANUALMENTE\n` +
          `dkim_signing {\n` +
          `  use_domain = "header";\n` +
          `  sign_authenticated = true;\n` +
          `  sign_inbound = false;\n` +
          `  domain {\n${domainEntries}\n  }\n` +
          `}\n`;

        const signingConfPath = path.join(
          this.rspamdDkimDir,
          '..',
          'local.d',
          'dkim_signing_auto.conf',
        );
        await fs.mkdir(path.dirname(signingConfPath), { recursive: true });
        await fs.writeFile(signingConfPath, signingConf, 'utf8');
        logger.debug({ count: dkimDomains.length }, 'Rspamd: dkim_signing_auto.conf escrito');
        break;
      }
      default:
        logger.warn({ templateKey }, 'Rspamd: templateKey desconocido');
    }
  }

  // ─── Descifrado AES-256-GCM (mismo algoritmo que DomainService) ───────────

  private decryptDkimKey(encryptedPrivateKey: string): string {
    const parts = encryptedPrivateKey.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de clave DKIM cifrada inválido');
    }
    const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
    const key = crypto.createHash('sha256').update(this.dkimEncryptionKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  }

  // ─── reload_service ───────────────────────────────────────────────────────

  async reloadService(payload: ReloadServicePayload): Promise<ReloadServiceResult> {
    const result = await this.execReloadInternal(payload.service);
    logger.info(
      { nodeId: this.nodeId, service: payload.service, reason: payload.reason },
      `Servicio recargado: ${result.status}`,
    );
    return result;
  }

  private async execReloadInternal(service: ServiceName): Promise<ReloadServiceResult> {
    const cmd = this.buildReloadCommand(service);
    try {
      await execAsync(cmd, { timeout: 30_000 });
      return { service, status: 'reloaded' };
    } catch (err) {
      logger.error({ service, err }, 'Error recargando servicio');
      return { service, status: 'failed' };
    }
  }

  private buildReloadCommand(service: ServiceName): string {
    const serviceCommands: Record<ServiceName, string> = {
      postfix: 'postfix reload',
      dovecot: 'doveadm reload',
      rspamd: 'rspamd reload',
    };
    const svcCmd = serviceCommands[service];
    if (this.mode === 'docker') {
      return `docker exec ${this.dockerContainers[service]} ${svcCmd}`;
    }
    return svcCmd;
  }

  // ─── health_check ─────────────────────────────────────────────────────────

  async healthCheck(payload: HealthCheckPayload): Promise<HealthCheckResult> {
    const services: ServiceHealthStatus[] = await Promise.all([
      this.getServiceHealth('postfix'),
      this.getServiceHealth('dovecot'),
      this.getServiceHealth('rspamd'),
    ]);

    const rawLoad = os.loadavg();
    const loadAvg: [number, number, number] = [rawLoad[0]!, rawLoad[1]!, rawLoad[2]!];
    const uptimeSeconds = Math.floor(os.uptime());

    let diskFreeBytes = os.freemem();
    let diskUsedPercent = 0;

    if (payload.deep) {
      try {
        const { stdout } = await execAsync(
          "df -B1 /var/mail --output=avail,pcent 2>/dev/null | tail -1",
          { timeout: 10_000 },
        );
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 2) {
          diskFreeBytes = parseInt(parts[0] ?? '0', 10);
          diskUsedPercent = parseInt((parts[1] ?? '0%').replace('%', ''), 10);
        }
      } catch {
        // df no disponible
      }
    }

    const allRunning = services.every((s) => s.running);
    const anyRunning = services.some((s) => s.running);
    const overallStatus = allRunning ? 'healthy' : anyRunning ? 'degraded' : 'unhealthy';

    return {
      nodeId: this.nodeId,
      overallStatus,
      services,
      diskFreeBytes,
      diskUsedPercent,
      loadAvg,
      uptimeSeconds,
    };
  }

  private async getServiceHealth(service: ServiceName): Promise<ServiceHealthStatus> {
    try {
      let pid = 0;
      if (this.mode === 'docker') {
        const container = this.dockerContainers[service];
        const { stdout } = await execAsync(
          `docker inspect --format='{{.State.Pid}}' ${container} 2>/dev/null`,
          { timeout: 10_000 },
        );
        pid = parseInt(stdout.trim(), 10);
      } else {
        const { stdout } = await execAsync(`pgrep -x ${service} 2>/dev/null | head -1`, {
          timeout: 5_000,
        });
        pid = parseInt(stdout.trim(), 10);
      }
      return {
        name: service,
        running: !isNaN(pid) && pid > 0,
        pid: isNaN(pid) ? undefined : pid,
        uptimeSeconds: Math.floor(os.uptime()),
        memoryMb: Math.floor(os.totalmem() / 1024 / 1024),
        cpuPercent: 0,
      };
    } catch {
      return { name: service, running: false };
    }
  }

  // ─── backup_execute ───────────────────────────────────────────────────────

  async backupExecute(payload: BackupExecutePayload): Promise<BackupExecuteResult> {
    const startMs = Date.now();
    const snapshotId = crypto.randomUUID();
    const targetPath = payload.targetPath ?? `/backups/${this.nodeId}`;
    const sourceDir =
      payload.type === 'config'
        ? '/etc/postfix /etc/dovecot /etc/rspamd'
        : '/var/mail';
    const resticTag = `type=${payload.type}`;

    let resticCmd: string;
    if (this.mode === 'docker') {
      resticCmd =
        `docker exec ${this.dockerContainers.postfix} ` +
        `restic backup ${sourceDir} --repo ${targetPath} --tag ${resticTag} --json 2>&1 | tail -1`;
    } else {
      resticCmd =
        `restic backup ${sourceDir} --repo ${targetPath} --tag ${resticTag} --json 2>&1 | tail -1`;
    }

    let sizeBytes = 0;
    try {
      const { stdout } = await execAsync(resticCmd, { timeout: 300_000 });
      const result = JSON.parse(stdout.trim()) as { total_bytes_processed?: number };
      sizeBytes = result.total_bytes_processed ?? 0;
    } catch {
      logger.warn(
        { nodeId: this.nodeId, type: payload.type },
        'Restic no disponible o error en backup',
      );
    }

    const durationMs = Date.now() - startMs;
    return { snapshotId, type: payload.type, sizeBytes, durationMs, storagePath: targetPath };
  }

  // ─── metrics_report ───────────────────────────────────────────────────────

  async metricsReport(_payload: MetricsReportPayload): Promise<MetricsReportResult> {
    const totalMem = Math.floor(os.totalmem() / 1024 / 1024);
    const freeMem = Math.floor(os.freemem() / 1024 / 1024);
    const smtpMetrics = await this.parsePostfixMetrics();

    let diskUsedBytes = 0;
    let diskTotalBytes = 0;
    try {
      const { stdout } = await execAsync(
        "df -B1 /var/mail --output=used,size 2>/dev/null | tail -1",
        { timeout: 10_000 },
      );
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        diskUsedBytes = parseInt(parts[0] ?? '0', 10);
        diskTotalBytes = parseInt(parts[1] ?? '0', 10);
      }
    } catch {
      // df no disponible
    }

    return {
      nodeId: this.nodeId,
      period: {
        from: new Date(Date.now() - 60_000).toISOString(),
        to: new Date().toISOString(),
      },
      smtp: smtpMetrics,
      imap: { activeConnections: 0, loginTotal: 0, failedLoginTotal: 0 },
      system: {
        cpuPercent: 0,
        memUsedMb: totalMem - freeMem,
        memTotalMb: totalMem,
        diskUsedBytes,
        diskTotalBytes,
      },
    };
  }

  private async parsePostfixMetrics(): Promise<MetricsReportResult['smtp']> {
    const counters = {
      sentTotal: 0,
      receivedTotal: 0,
      deferredTotal: 0,
      bouncedTotal: 0,
      rejectedTotal: 0,
    };
    try {
      let logContent = '';
      if (this.mode === 'docker') {
        const { stdout } = await execAsync(
          `docker logs ${this.dockerContainers.postfix} --since=1m 2>&1`,
          { timeout: 15_000 },
        );
        logContent = stdout;
      } else {
        const { stdout } = await execAsync(
          `journalctl -u postfix --since "1 minute ago" --no-pager 2>/dev/null || ` +
            `tail -n 500 /var/log/mail.log 2>/dev/null || true`,
          { timeout: 15_000 },
        );
        logContent = stdout;
      }
      for (const line of logContent.split('\n')) {
        if (line.includes('status=sent')) counters.sentTotal++;
        else if (line.includes('status=deferred')) counters.deferredTotal++;
        else if (line.includes('status=bounced')) counters.bouncedTotal++;
        else if (line.includes('NOQUEUE: reject')) counters.rejectedTotal++;
        else if (line.includes('message-id=') && line.includes('from=<'))
          counters.receivedTotal++;
      }
    } catch {
      // Logs no disponibles
    }
    return counters;
  }

  // ─── queue_stats ──────────────────────────────────────────────────────────

  async queueStats(_payload: QueueStatsPayload): Promise<QueueStatsResult> {
    let activeQueue = 0;
    let deferredQueue = 0;
    try {
      let mailqOutput = '';
      if (this.mode === 'docker') {
        const { stdout } = await execAsync(
          `docker exec ${this.dockerContainers.postfix} mailq 2>/dev/null`,
          { timeout: 15_000 },
        );
        mailqOutput = stdout;
      } else {
        const { stdout } = await execAsync('mailq 2>/dev/null', { timeout: 15_000 });
        mailqOutput = stdout;
      }
      for (const line of mailqOutput.split('\n')) {
        if (/^\w{10,}\s+\d+\s+/.test(line)) {
          if (line.includes('(deferred)') || line.includes('(connect to')) {
            deferredQueue++;
          } else {
            activeQueue++;
          }
        }
      }
    } catch {
      // mailq no disponible
    }
    return {
      nodeId: this.nodeId,
      activeQueue,
      deferredQueue,
      holdQueue: 0,
      activeEntries: [],
      deferredEntries: [],
    };
  }

  // ─── Helpers de respuesta (igual que MockOperationsService) ───────────────

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
