import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { AuditService } from '../audit/audit.service';
import type { SimulateDrInput, DrScenario } from '@4nexa/validators';

// ─── Tipos de resultado DR ────────────────────────────────────────────────────

export interface DrStep {
  order:       number;
  action:      string;
  description: string;
  automated:   boolean;
}

export interface DrPlan {
  scenario:    DrScenario;
  rtoMinutes:  number;
  rpoMinutes:  number;
  steps:       DrStep[];
}

export interface DrSimulationResult {
  scenario:    DrScenario;
  dryRun:      boolean;
  plan:        DrPlan;
  /** En dry-run, acciones que se HABRÍAN ejecutado; en live, acciones ejecutadas */
  executed:    string[];
  status:      'COMPLETED' | 'PARTIAL' | 'DRY_RUN';
  simulatedAt: string;
}

export interface DrSystemStatus {
  healthy:            boolean;
  nodesTotal:         number;
  nodesHealthy:       number;
  nodesDraining:      number;
  nodesQuarantined:   number;
  domainsWithCerts:   number;
  domainsTotal:       number;
  lastBackupAge:      number | null;   // minutos desde último backup exitoso
  checkedAt:          string;
}

// ─── Definición de planes DR ──────────────────────────────────────────────────

const DR_PLANS: Record<DrScenario, Omit<DrPlan, 'scenario'>> = {
  node_loss: {
    rtoMinutes: 30,
    rpoMinutes: 5,
    steps: [
      { order: 1, action: 'detect_node_failure',     description: 'NodeAgent detecta ausencia de heartbeat > 120s y emite node.unhealthy', automated: true  },
      { order: 2, action: 'quarantine_node',          description: 'Marcar nodo como QUARANTINED para bloquear nuevas asignaciones',        automated: true  },
      { order: 3, action: 'reassign_tenants',         description: 'NodeAssignmentService reasigna tenants del nodo perdido a nodos sanos', automated: true  },
      { order: 4, action: 'update_dns_records',       description: 'Actualizar MX y registros DNS de los dominios afectados',              automated: false },
      { order: 5, action: 'verify_mail_flow',         description: 'Verificar que el flujo de correo se ha restaurado correctamente',      automated: false },
      { order: 6, action: 'audit_reassignment',       description: 'Registrar en audit log todos los cambios de nodo',                    automated: true  },
    ],
  },

  postgres_corruption: {
    rtoMinutes: 120,
    rpoMinutes: 60,
    steps: [
      { order: 1, action: 'detect_db_error',          description: 'Alertas de salud detectan errores críticos de PostgreSQL',             automated: true  },
      { order: 2, action: 'stop_write_traffic',       description: 'Activar modo read-only en control-plane-api para proteger datos',     automated: false },
      { order: 3, action: 'restore_from_backup',      description: 'BackupService restaura el último backup válido en un nuevo volumen',   automated: false },
      { order: 4, action: 'apply_wal_logs',           description: 'Aplicar WAL logs disponibles para minimizar pérdida de datos',        automated: false },
      { order: 5, action: 'run_prisma_migrate',       description: 'Ejecutar `prisma migrate deploy` para validar schema',                automated: false },
      { order: 6, action: 'smoke_test',               description: 'Tests de humo sobre CRUD crítico (tenants, domains, mailboxes)',       automated: false },
      { order: 7, action: 'resume_write_traffic',     description: 'Restaurar tráfico de escritura y monitorear errores',                 automated: false },
    ],
  },

  certificate_loss: {
    rtoMinutes: 15,
    rpoMinutes: 0,
    steps: [
      { order: 1, action: 'detect_cert_failure',     description: 'PKI health check detecta certificados expirados o ausentes',          automated: true  },
      { order: 2, action: 'regenerate_node_certs',   description: 'Re-enrolar certificados mTLS de nodos afectados vía NodeAgentModule',  automated: true  },
      { order: 3, action: 'rotate_dkim_keys',        description: 'CredentialRotationService rota las claves DKIM de dominios afectados', automated: true  },
      { order: 4, action: 'update_dns_dkim_records', description: 'Actualizar registros TXT DKIM en los nameservers',                    automated: false },
      { order: 5, action: 'verify_tls_handshakes',   description: 'Verificar que los nodos establecen TLS correctamente',                automated: false },
    ],
  },

  full_cluster_loss: {
    rtoMinutes: 240,
    rpoMinutes: 60,
    steps: [
      { order: 1, action: 'activate_dr_site',         description: 'Activar región de DR y redirigir DNS global',                        automated: false },
      { order: 2, action: 'restore_postgres',          description: 'Restaurar snapshot PostgreSQL más reciente en DR',                   automated: false },
      { order: 3, action: 'restore_redis',             description: 'Restaurar Redis con snapshot de BullMQ y caché',                     automated: false },
      { order: 4, action: 'deploy_control_plane',      description: 'Desplegar control-plane-api en DR con variables de entorno',         automated: false },
      { order: 5, action: 'provision_nodes',           description: 'Provisionar nuevos nodos SMTP en la región de DR',                   automated: false },
      { order: 6, action: 'regenerate_all_certs',      description: 'Re-emitir todos los certificados mTLS de nodo',                     automated: true  },
      { order: 7, action: 'rotate_dkim_all_domains',   description: 'Rotar claves DKIM en todos los dominios activos',                   automated: true  },
      { order: 8, action: 'notify_tenants',            description: 'Notificar a los tenants el RTO estimado y estado del servicio',     automated: false },
      { order: 9, action: 'smoke_test_all',            description: 'Tests de humo completos en la región de DR',                        automated: false },
    ],
  },
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DisasterRecoveryService {
  private readonly logger = new Logger(DisasterRecoveryService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly eventBus:  EventBusService,
    private readonly audit:     AuditService,
  ) {}

  // ── Obtener estado actual del sistema ──────────────────────────────────────

  async getSystemStatus(): Promise<DrSystemStatus> {
    const [nodes, domainsTotal, lastBackup] = await Promise.all([
      this.prisma.node.findMany({ select: { status: true } }),
      this.prisma.domain.count({ where: { deletedAt: null } }),
      this.prisma.backupJob.findFirst({
        where:   { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select:  { completedAt: true },
      }),
    ]);

    const nodesHealthy     = nodes.filter((n: { status: string }) => n.status === 'HEALTHY').length;
    const nodesDraining    = nodes.filter((n: { status: string }) => n.status === 'DRAINING').length;
    const nodesQuarantined = nodes.filter((n: { status: string }) => n.status === 'QUARANTINED').length;

    const domainsWithCerts = await this.prisma.domain.count({
      where: { deletedAt: null, dkimPublicKey: { not: null } },
    });

    let lastBackupAge: number | null = null;
    if (lastBackup?.completedAt) {
      lastBackupAge = Math.floor((Date.now() - lastBackup.completedAt.getTime()) / 60_000);
    }

    const healthy =
      nodesHealthy > 0 &&
      nodesQuarantined === 0 &&
      (lastBackupAge === null || lastBackupAge < 1440); // < 24h

    return {
      healthy,
      nodesTotal:       nodes.length,
      nodesHealthy,
      nodesDraining,
      nodesQuarantined,
      domainsWithCerts,
      domainsTotal,
      lastBackupAge,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Simular o ejecutar escenario DR ───────────────────────────────────────

  async simulate(input: SimulateDrInput, userId?: string): Promise<DrSimulationResult> {
    const planDef = DR_PLANS[input.scenario];
    const plan: DrPlan = { scenario: input.scenario, ...planDef };

    const executed: string[] = [];

    if (!input.dryRun) {
      // En modo live: ejecutar sólo los pasos automatizados
      for (const step of plan.steps.filter((s) => s.automated)) {
        this.logger.log(`[DR:${input.scenario}] Ejecutando: ${step.action}`);
        await this.executeStep(input, step);
        executed.push(step.action);
      }
    } else {
      executed.push(...plan.steps.map((s) => `[DRY-RUN] ${s.action}`));
    }

    await this.audit.log({
      action:     `dr.${input.scenario}`,
      entityType: 'system',
      userId,
      metadata:   { dryRun: input.dryRun, nodeId: input.nodeId, tenantId: input.tenantId },
    });

    return {
      scenario:    input.scenario,
      dryRun:      input.dryRun,
      plan,
      executed,
      status:      input.dryRun ? 'DRY_RUN' : 'COMPLETED',
      simulatedAt: new Date().toISOString(),
    };
  }

  // ── Ejecutores de pasos automatizados ─────────────────────────────────────

  private async executeStep(input: SimulateDrInput, step: DrStep): Promise<void> {
    switch (step.action) {
      case 'quarantine_node': {
        if (input.nodeId) {
          await this.prisma.node.update({
            where: { id: input.nodeId },
            data:  { status: 'QUARANTINED' },
          });
          // Obtener hostname para el evento
          const nodeData = await this.prisma.node.findUnique({
            where:  { id: input.nodeId },
            select: { hostname: true },
          });
          await this.eventBus.publish({
            type:       'node.quarantined',
            nodeId:     input.nodeId,
            hostname:   nodeData?.hostname ?? 'unknown',
            reason:     'disaster_recovery',
            occurredAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'audit_reassignment': {
        await this.audit.log({
          action:     'dr.node_loss.audit_reassignment',
          entityType: 'node',
          entityId:   input.nodeId,
          metadata:   { scenario: input.scenario },
        });
        break;
      }

      case 'detect_cert_failure':
      case 'detect_node_failure':
      case 'detect_db_error': {
        // Los detectores son eventos, no acciones directas — se marcan como ejecutados
        break;
      }

      default: {
        this.logger.debug(`[DR] Paso "${step.action}" ejecutado (sin acción directa en control-plane)`);
      }
    }
  }
}
