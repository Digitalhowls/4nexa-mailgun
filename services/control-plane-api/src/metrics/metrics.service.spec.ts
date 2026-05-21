import 'reflect-metadata';
import { MetricsService } from './metrics.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EventBusService } from '../event-bus/event-bus.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQueue(counts: Record<string, number> = {}) {
  return { getJobCounts: jest.fn().mockResolvedValue(counts) };
}

function makeEventBus() {
  return {
    getQueue:    jest.fn().mockReturnValue(makeQueue({ waiting: 1, active: 0, completed: 10, failed: 2, delayed: 0 })),
    getDlqQueue: jest.fn().mockReturnValue(makeQueue({ waiting: 1 })),
  } as unknown as EventBusService;
}

function makePrisma(): PrismaService {
  return {
    tenant:    { groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 3 } }]), aggregate: jest.fn().mockResolvedValue({ _avg: { trustScore: 95 } }) },
    domain:    { groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 5 } }]), aggregate: jest.fn().mockResolvedValue({ _avg: { healthScore: 88 } }) },
    mailbox:   { groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 20 } }]) },
    node:      {
      groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 2 } }]),
      aggregate: jest.fn().mockResolvedValue({ _avg: { reputationScore: 75 } }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'node-1', hostname: 'mx1.acme.com', region: 'eu-west', provider: 'hetzner', reputationScore: 90, warmupStatus: 'WARM', currentTenants: 5, maxTenants: 50 },
        { id: 'node-2', hostname: 'mx2.acme.com', region: 'eu-west', provider: 'hetzner', reputationScore: 70, warmupStatus: 'WARMING', currentTenants: 10, maxTenants: 50 },
      ]),
    },
    backupJob: { groupBy: jest.fn().mockResolvedValue([{ status: 'COMPLETED', _count: { id: 4 } }]) },
  } as unknown as PrismaService;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService(makePrisma(), makeEventBus());
  });

  describe('collect()', () => {
    it('devuelve texto con formato Prometheus válido', async () => {
      const output = await service.collect();

      expect(typeof output).toBe('string');
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('incluye la métrica 4nexa_mailgun_tenants_total', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_tenants_total');
    });

    it('incluye la métrica 4nexa_mailgun_domains_total', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_domains_total');
    });

    it('incluye la métrica 4nexa_mailgun_nodes_total', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_nodes_total');
    });

    it('incluye la métrica 4nexa_mailgun_queue_jobs_total', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_queue_jobs_total');
    });

    it('incluye la métrica de reputación con los tres tipos de entidad', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_reputation_score_avg');
      expect(output).toContain('entity_type="node"');
      expect(output).toContain('entity_type="tenant"');
      expect(output).toContain('entity_type="domain"');
    });

    it('incluye las etiquetas status para tenants', async () => {
      const output = await service.collect();
      expect(output).toContain('status="ACTIVE"');
    });

    it('incluye métricas de la DLQ', async () => {
      const output = await service.collect();
      expect(output).toContain('system-events-dlq');
    });

    it('termina con newline final', async () => {
      const output = await service.collect();
      expect(output.endsWith('\n')).toBe(true);
    });

    // ─── §22.4 Labels por nodo ────────────────────────────────────────────

    it('incluye 4nexa_mailgun_node_reputation_score con label node_id', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_node_reputation_score');
      expect(output).toContain('node_id="node-1"');
      expect(output).toContain('region="eu-west"');
      expect(output).toContain('provider="hetzner"');
    });

    it('incluye 4nexa_mailgun_node_tenants_current con label warmup_status', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_node_tenants_current');
      expect(output).toContain('warmup_status="WARM"');
      expect(output).toContain('warmup_status="WARMING"');
    });

    it('incluye 4nexa_mailgun_node_tenants_max', async () => {
      const output = await service.collect();
      expect(output).toContain('4nexa_mailgun_node_tenants_max');
    });

    it('devuelve ceros en colas cuando Redis no está disponible (getQueueCounts error)', async () => {
      const errorEventBus = {
        getQueue: jest.fn().mockReturnValue({ getJobCounts: jest.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')) }),
        getDlqQueue: jest.fn().mockReturnValue({ getJobCounts: jest.fn().mockRejectedValue(new Error('Redis ECONNREFUSED')) }),
      } as unknown as import('../event-bus/event-bus.service').EventBusService;

      const svc = new MetricsService(makePrisma(), errorEventBus);
      const output = await svc.collect();

      // No debe lanzar; debe emitir las métricas de cola con valores 0
      expect(output).toContain('4nexa_mailgun_queue_jobs_total');
      expect(output).toContain('system-events');
    });

    it('usa ?? 0 cuando getJobCounts devuelve objeto vacío (branches 214-219)', async () => {
      // getJobCounts devuelve {} → todos los ?? 0 se activan
      const emptyCountsEventBus = {
        getQueue: jest.fn().mockReturnValue({ getJobCounts: jest.fn().mockResolvedValue({}) }),
        getDlqQueue: jest.fn().mockReturnValue({ getJobCounts: jest.fn().mockResolvedValue({}) }),
      } as unknown as import('../event-bus/event-bus.service').EventBusService;

      const svc = new MetricsService(makePrisma(), emptyCountsEventBus);
      const output = await svc.collect();
      expect(output).toContain('4nexa_mailgun_queue_jobs_total');
    });

    it('serializa métricas sin etiquetas cuando samples.labels está vacío', async () => {
      // Esto cubre la rama `labelStr ? suffix : ''` cuando no hay labels
      const prismaNoLabels = {
        ...makePrisma(),
        tenant: {
          groupBy: jest.fn().mockResolvedValue([]), // sin muestras para tenants
          aggregate: jest.fn().mockResolvedValue({ _avg: { trustScore: null } }), // null → usa 100 por defecto
        },
        domain: {
          groupBy: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _avg: { healthScore: null } }),
        },
        node: {
          groupBy: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _avg: { reputationScore: null } }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        backupJob: { groupBy: jest.fn().mockResolvedValue([]) },
      } as unknown as import('../prisma/prisma.service').PrismaService;

      const svc = new MetricsService(prismaNoLabels, makeEventBus());
      const output = await svc.collect();

      // Usar el valor fallback 100 para las medias nulas
      expect(output).toContain('entity_type="node"');
      expect(output).toContain('100');
    });
  });
});
