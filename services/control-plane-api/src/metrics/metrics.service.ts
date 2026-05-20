import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { createLogger } from '@4nexa/logger';

const logger = createLogger({ service: 'control-plane-api', module: 'MetricsService' });

interface LabeledCounter {
  labels: Record<string, string>;
  value: number;
}

interface MetricFamily {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  samples: LabeledCounter[];
}

/**
 * Serializa una familia de métricas al formato texto de Prometheus.
 */
function serializeFamily(family: MetricFamily): string {
  const lines: string[] = [
    `# HELP ${family.name} ${family.help}`,
    `# TYPE ${family.name} ${family.type}`,
  ];

  for (const sample of family.samples) {
    const labelStr = Object.entries(sample.labels)
      .map(([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
      .join(',');
    const suffix = labelStr ? `{${labelStr}}` : '';
    lines.push(`${family.name}${suffix} ${sample.value}`);
  }

  return lines.join('\n');
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Recopila todas las métricas del sistema y las devuelve en formato Prometheus text.
   * Naming convention: 4nexa_mailgun_<service>_<metric> (§22.3).
   */
  async collect(): Promise<string> {
    logger.debug({}, 'Recopilando métricas del sistema');

    const [
      tenantCounts,
      domainCounts,
      mailboxCounts,
      nodeCounts,
      backupJobCounts,
      avgNodeReputation,
      avgTenantTrust,
      avgDomainHealth,
      queueCounts,
      nodeDetails,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.domain.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.mailbox.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.node.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.backupJob.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.node.aggregate({ _avg: { reputationScore: true } }),
      this.prisma.tenant.aggregate({ _avg: { trustScore: true } }),
      this.prisma.domain.aggregate({ _avg: { healthScore: true } }),
      this.getQueueCounts(),
      // §22.4 — Labels por nodo (node_id, region, provider)
      this.prisma.node.findMany({
        select: {
          id: true,
          hostname: true,
          region: true,
          provider: true,
          reputationScore: true,
          warmupStatus: true,
          currentTenants: true,
          maxTenants: true,
        },
      }),
    ]);

    const families: MetricFamily[] = [
      // ─── Tenants ─────────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_tenants_total',
        help: 'Total de tenants por estado',
        type: 'gauge',
        samples: tenantCounts.map((row) => ({
          labels: { status: row.status },
          value: row._count.id,
        })),
      },
      // ─── Dominios ─────────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_domains_total',
        help: 'Total de dominios por estado',
        type: 'gauge',
        samples: domainCounts.map((row) => ({
          labels: { status: row.status },
          value: row._count.id,
        })),
      },
      // ─── Mailboxes ────────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_mailboxes_total',
        help: 'Total de buzones por estado',
        type: 'gauge',
        samples: mailboxCounts.map((row) => ({
          labels: { status: row.status },
          value: row._count.id,
        })),
      },
      // ─── Nodos ───────────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_nodes_total',
        help: 'Total de nodos por estado',
        type: 'gauge',
        samples: nodeCounts.map((row) => ({
          labels: { status: row.status },
          value: row._count.id,
        })),
      },
      // ─── Backup jobs ──────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_backup_jobs_total',
        help: 'Total de jobs de backup por estado',
        type: 'gauge',
        samples: backupJobCounts.map((row) => ({
          labels: { status: row.status },
          value: row._count.id,
        })),
      },
      // ─── Reputación (scores medios) ───────────────────────────────────────
      {
        name: '4nexa_mailgun_reputation_score_avg',
        help: 'Score de reputación medio por tipo de entidad',
        type: 'gauge',
        samples: [
          { labels: { entity_type: 'node' },   value: Math.round(avgNodeReputation._avg.reputationScore ?? 100) },
          { labels: { entity_type: 'tenant' },  value: Math.round(avgTenantTrust._avg.trustScore ?? 100) },
          { labels: { entity_type: 'domain' },  value: Math.round(avgDomainHealth._avg.healthScore ?? 100) },
        ],
      },
      // ─── Cola BullMQ ──────────────────────────────────────────────────────
      {
        name: '4nexa_mailgun_queue_jobs_total',
        help: 'Jobs en la cola BullMQ por estado',
        type: 'gauge',
        samples: [
          { labels: { queue: 'system-events', state: 'waiting' },   value: queueCounts.waiting },
          { labels: { queue: 'system-events', state: 'active' },    value: queueCounts.active },
          { labels: { queue: 'system-events', state: 'failed' },    value: queueCounts.failed },
          { labels: { queue: 'system-events', state: 'delayed' },   value: queueCounts.delayed },
          { labels: { queue: 'system-events', state: 'completed' }, value: queueCounts.completed },
          { labels: { queue: 'system-events-dlq', state: 'waiting' }, value: queueCounts.dlq },
        ],
      },
      // ─── §22.4 Métricas por nodo con labels node_id/region/provider ──────
      {
        name: '4nexa_mailgun_node_reputation_score',
        help: 'Score de reputación por nodo',
        type: 'gauge',
        samples: nodeDetails.map((n) => ({
          labels: { node_id: n.id, hostname: n.hostname, region: n.region, provider: n.provider },
          value: n.reputationScore,
        })),
      },
      {
        name: '4nexa_mailgun_node_tenants_current',
        help: 'Número actual de tenants asignados por nodo',
        type: 'gauge',
        samples: nodeDetails.map((n) => ({
          labels: {
            node_id: n.id,
            hostname: n.hostname,
            region: n.region,
            provider: n.provider,
            warmup_status: n.warmupStatus,
          },
          value: n.currentTenants,
        })),
      },
      {
        name: '4nexa_mailgun_node_tenants_max',
        help: 'Capacidad máxima de tenants por nodo',
        type: 'gauge',
        samples: nodeDetails.map((n) => ({
          labels: { node_id: n.id, hostname: n.hostname, region: n.region, provider: n.provider },
          value: n.maxTenants,
        })),
      },
    ];

    return families.map(serializeFamily).join('\n\n') + '\n';
  }

  private async getQueueCounts() {
    try {
      const [main, dlq] = await Promise.all([
        this.eventBus.getQueue().getJobCounts(
          'waiting', 'active', 'completed', 'failed', 'delayed',
        ),
        this.eventBus.getDlqQueue().getJobCounts('waiting'),
      ]);
      return {
        waiting:   main['waiting']   ?? 0,
        active:    main['active']    ?? 0,
        completed: main['completed'] ?? 0,
        failed:    main['failed']    ?? 0,
        delayed:   main['delayed']   ?? 0,
        dlq:       dlq['waiting']    ?? 0,
      };
    } catch {
      // Si Redis no está disponible, devuelve ceros
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, dlq: 0 };
    }
  }
}
