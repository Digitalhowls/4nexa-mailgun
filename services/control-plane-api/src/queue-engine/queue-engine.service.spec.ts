import 'reflect-metadata';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QueueEngineService } from './queue-engine.service';
import type { EventBusService } from '../event-bus/event-bus.service';
import type { NodeAgentClient } from '../node-agent/node-agent.client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<{
  id: string;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string;
  data: unknown;
}> = {}) {
  return {
    id:           overrides.id           ?? 'job-1',
    name:         overrides.name         ?? 'tenant.created',
    attemptsMade: overrides.attemptsMade ?? 0,
    timestamp:    overrides.timestamp    ?? Date.now(),
    processedOn:  overrides.processedOn  ?? null,
    finishedOn:   overrides.finishedOn   ?? null,
    failedReason: overrides.failedReason ?? undefined,
    data:         overrides.data         ?? {},
    getState:     jest.fn().mockResolvedValue(overrides.state ?? 'waiting'),
    retry:        jest.fn().mockResolvedValue(undefined),
    remove:       jest.fn().mockResolvedValue(undefined),
  };
}

function makeQueue(overrides: Partial<{
  counts: Record<string, number>;
  jobs: ReturnType<typeof makeJob>[];
  singleJob: ReturnType<typeof makeJob> | null;
}> = {}) {
  return {
    getJobCounts: jest.fn().mockResolvedValue(overrides.counts ?? { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
    getJobs:      jest.fn().mockResolvedValue(overrides.jobs ?? []),
    getJob:       jest.fn().mockResolvedValue(overrides.singleJob ?? null),
  };
}

function makeEventBus(mainQueue = makeQueue(), dlqQueue = makeQueue()) {
  return {
    getQueue:    jest.fn().mockReturnValue(mainQueue),
    getDlqQueue: jest.fn().mockReturnValue(dlqQueue),
    publish:     jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

function makeAgentClient() {
  return {
    queueStats: jest.fn().mockResolvedValue({ data: { queueSize: 42 } }),
  } as unknown as NodeAgentClient;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('QueueEngineService', () => {
  let service: QueueEngineService;

  // ─── getStats() ──────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('devuelve contadores de la cola principal y la DLQ', async () => {
      const mainQueue = makeQueue({ counts: { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 } });
      const dlqQueue  = makeQueue({ counts: { waiting: 2 } });
      service = new QueueEngineService(makeEventBus(mainQueue, dlqQueue), makeAgentClient());

      const result = await service.getStats();

      expect(result.main.waiting).toBe(5);
      expect(result.main.failed).toBe(3);
      expect(result.dlq.waiting).toBe(2);
    });
  });

  // ─── getJobs() ───────────────────────────────────────────────────────────

  describe('getJobs()', () => {
    it('devuelve jobs con paginación', async () => {
      const job = makeJob({ id: 'job-1', name: 'mail.bounced' });
      const mainQueue = makeQueue({ jobs: [job], counts: { failed: 1 } });
      service = new QueueEngineService(makeEventBus(mainQueue), makeAgentClient());

      const result = await service.getJobs('failed', 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('job-1');
      expect(result.items[0].name).toBe('mail.bounced');
    });
  });

  // ─── retryJob() ──────────────────────────────────────────────────────────

  describe('retryJob()', () => {
    it('llama job.retry() en un job fallido', async () => {
      const job = makeJob({ id: 'job-1', state: 'failed' });
      const mainQueue = makeQueue({ singleJob: job });
      service = new QueueEngineService(makeEventBus(mainQueue), makeAgentClient());

      await service.retryJob('job-1');

      expect(job.retry).toHaveBeenCalledWith('failed');
    });

    it('lanza NotFoundException si el job no existe', async () => {
      const mainQueue = makeQueue({ singleJob: null });
      service = new QueueEngineService(makeEventBus(mainQueue), makeAgentClient());

      await expect(service.retryJob('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el job no está en estado failed', async () => {
      const job = makeJob({ id: 'job-1', state: 'active' });
      const mainQueue = makeQueue({ singleJob: job });
      service = new QueueEngineService(makeEventBus(mainQueue), makeAgentClient());

      await expect(service.retryJob('job-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── purgeByState() ──────────────────────────────────────────────────────

  describe('purgeByState()', () => {
    it('elimina todos los jobs en el estado dado', async () => {
      const jobs = [makeJob({ id: 'j1' }), makeJob({ id: 'j2' })];
      const mainQueue = makeQueue({ jobs });
      service = new QueueEngineService(makeEventBus(mainQueue), makeAgentClient());

      const count = await service.purgeByState('failed');

      expect(count).toBe(2);
      expect(jobs[0].remove).toHaveBeenCalled();
      expect(jobs[1].remove).toHaveBeenCalled();
    });

    it('lanza BadRequestException al intentar purgar jobs activos', async () => {
      service = new QueueEngineService(makeEventBus(), makeAgentClient());

      await expect(service.purgeByState('active')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getDlqJobs() ────────────────────────────────────────────────────────

  describe('getDlqJobs()', () => {
    it('devuelve jobs de la DLQ', async () => {
      const job = makeJob({ id: 'dlq-1', name: 'backup.failed' });
      const dlqQueue = makeQueue({ jobs: [job], counts: { waiting: 1 } });
      service = new QueueEngineService(makeEventBus(makeQueue(), dlqQueue), makeAgentClient());

      const result = await service.getDlqJobs(1, 10);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].state).toBe('dlq');
    });
  });

  // ─── restoreDlqJob() ─────────────────────────────────────────────────────

  describe('restoreDlqJob()', () => {
    it('republica el job en la cola principal y lo elimina de la DLQ', async () => {
      const job = makeJob({ id: 'dlq-1', name: 'backup.failed', data: { type: 'backup.failed' } });
      const dlqQueue = makeQueue({ singleJob: job });
      const eb = makeEventBus(makeQueue(), dlqQueue);
      service = new QueueEngineService(eb, makeAgentClient());

      await service.restoreDlqJob('dlq-1');

      expect(eb.publish).toHaveBeenCalledWith(job.data);
      expect(job.remove).toHaveBeenCalled();
    });

    it('lanza NotFoundException si el job DLQ no existe', async () => {
      const dlqQueue = makeQueue({ singleJob: null });
      service = new QueueEngineService(makeEventBus(makeQueue(), dlqQueue), makeAgentClient());

      await expect(service.restoreDlqJob('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getNodeQueueStats() ─────────────────────────────────────────────────

  describe('getNodeQueueStats()', () => {
    it('llama al agentClient.queueStats y devuelve los datos', async () => {
      const agentClient = makeAgentClient();
      service = new QueueEngineService(makeEventBus(), agentClient);

      const result = await service.getNodeQueueStats('node-uuid-1');

      expect(agentClient.queueStats).toHaveBeenCalledWith('node-uuid-1');
      expect(result).toEqual({ queueSize: 42 });
    });
  });

  // ─── Branches ?? 0 ────────────────────────────────────────────────────────

  describe('getStats() — ?? 0 cuando keys son undefined', () => {
    it('usa 0 cuando getJobCounts devuelve objeto vacío', async () => {
      const emptyQueue = makeQueue({ counts: {} });
      service = new QueueEngineService(makeEventBus(emptyQueue, emptyQueue), makeAgentClient());
      const result = await service.getStats();
      expect(result.main.waiting).toBe(0);
      expect(result.main.active).toBe(0);
      expect(result.dlq.waiting).toBe(0);
    });
  });

  describe('getJobs() — ?? 0 total cuando key no existe', () => {
    it('retorna total 0 cuando el estado no está en el resultado de getJobCounts', async () => {
      const queueWithEmptyCounts = { ...makeQueue(), getJobCounts: jest.fn().mockResolvedValue({}) };
      service = new QueueEngineService(makeEventBus(queueWithEmptyCounts as any), makeAgentClient());
      const result = await service.getJobs('waiting', 1, 10);
      expect(result.total).toBe(0);
    });
  });

  describe('getDlqJobs() — ?? 0 cuando counts.waiting es undefined', () => {
    it('retorna total 0 cuando la DLQ no tiene la key waiting', async () => {
      const dlqQueue = { ...makeQueue(), getJobCounts: jest.fn().mockResolvedValue({}) };
      service = new QueueEngineService(makeEventBus(makeQueue(), dlqQueue as any), makeAgentClient());
      const result = await service.getDlqJobs(1, 10);
      expect(result.total).toBe(0);
    });
  });
});
