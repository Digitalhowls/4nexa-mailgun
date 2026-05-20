import 'reflect-metadata';
import { EventBusService, EVENT_QUEUE_NAME, DLQ_QUEUE_NAME } from './event-bus.service';
import { EVENT_PRIORITIES } from './event-bus.types';
import type { RedisService } from '../redis/redis.service';
import type { SystemEvent } from './event-bus.types';

// ─── Mocks de BullMQ ─────────────────────────────────────────────────────────

const mockAdd     = jest.fn().mockResolvedValue({ id: 'job-1' });
const mockAddBulk = jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]);
const mockClose   = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add:     mockAdd,
    addBulk: mockAddBulk,
    close:   mockClose,
  })),
}));

// ─── Mock de dependencias ─────────────────────────────────────────────────────

function makeRedis(): RedisService {
  return { client: {} as never } as unknown as RedisService;
}

// ─── Helper: evento de prueba ─────────────────────────────────────────────────

function makeTenantEvent(): SystemEvent {
  return {
    type: 'tenant.created',
    tenantId: 'tenant-001',
    slug: 'acme-corp',
    planId: 'plan-free',
    nodeId: null,
    occurredAt: new Date().toISOString(),
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EventBusService', () => {
  let service: EventBusService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventBusService(makeRedis());
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ─── publish() ────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('llama queue.add con el tipo y payload del evento', async () => {
      const event = makeTenantEvent();
      await service.publish(event);

      expect(mockAdd).toHaveBeenCalledTimes(1);
      expect(mockAdd).toHaveBeenCalledWith(
        event.type,
        event,
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it('incluye la prioridad correcta según EVENT_PRIORITIES', async () => {
      const event = makeTenantEvent(); // tenant.created → priority 50
      await service.publish(event);

      expect(mockAdd).toHaveBeenCalledWith(
        event.type,
        event,
        expect.objectContaining({ priority: EVENT_PRIORITIES['tenant.created'] }),
      );
    });

    it('eventos críticos tienen prioridad 1', async () => {
      const event: SystemEvent = {
        type: 'abuse.detected',
        tenantId: 'tenant-001',
        domainId: null,
        mailboxId: null,
        nodeId: null,
        reason: 'spam',
        severity: 'critical',
        occurredAt: new Date().toISOString(),
      };
      await service.publish(event);

      expect(mockAdd).toHaveBeenCalledWith(
        event.type,
        event,
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('no propaga errores cuando queue.add falla (fire-and-forget)', async () => {
      mockAdd.mockRejectedValueOnce(new Error('Redis connection lost'));

      await expect(service.publish(makeTenantEvent())).resolves.toBeUndefined();
    });
  });

  // ─── publishBulk() ────────────────────────────────────────────────────────

  describe('publishBulk()', () => {
    it('llama queue.addBulk con un item por evento e incluye prioridad', async () => {
      const events: SystemEvent[] = [
        makeTenantEvent(),
        {
          type: 'tenant.suspended',
          tenantId: 'tenant-002',
          slug: 'acme-corp-2',
          reason: 'non-payment',
          occurredAt: new Date().toISOString(),
        },
      ];

      await service.publishBulk(events);

      expect(mockAddBulk).toHaveBeenCalledTimes(1);
      const [bulkArgs] = mockAddBulk.mock.calls[0] as [Array<{ name: string; data: SystemEvent; opts: { priority: number } }>];
      expect(bulkArgs).toHaveLength(2);
      expect(bulkArgs[0].name).toBe('tenant.created');
      expect(bulkArgs[0].opts.priority).toBe(EVENT_PRIORITIES['tenant.created']);
      expect(bulkArgs[1].name).toBe('tenant.suspended');
    });

    it('no hace nada si el array está vacío', async () => {
      await service.publishBulk([]);
      expect(mockAddBulk).not.toHaveBeenCalled();
    });

    it('no propaga errores cuando queue.addBulk falla (fire-and-forget)', async () => {
      mockAddBulk.mockRejectedValueOnce(new Error('Redis down'));
      const events: SystemEvent[] = [makeTenantEvent()];

      await expect(service.publishBulk(events)).resolves.toBeUndefined();
    });
  });

  // ─── getQueue() / getDlqQueue() ───────────────────────────────────────────

  describe('getQueue() / getDlqQueue()', () => {
    it('getQueue() devuelve la instancia de Queue', () => {
      expect(service.getQueue()).toBeDefined();
    });

    it('getDlqQueue() devuelve la instancia de la DLQ', () => {
      expect(service.getDlqQueue()).toBeDefined();
    });

    it('inicializa las dos colas con sus nombres correctos', () => {
      const { Queue } = jest.requireMock('bullmq') as { Queue: jest.Mock };
      const calls = Queue.mock.calls as Array<[string, unknown]>;
      const names = calls.map(([name]) => name);
      expect(names).toContain(EVENT_QUEUE_NAME);
      expect(names).toContain(DLQ_QUEUE_NAME);
    });
  });

  // ─── moveJobToDlq() ───────────────────────────────────────────────────────

  describe('moveJobToDlq()', () => {
    it('añade el job a la DLQ con prefijo dlq:', async () => {
      const fakeJob = {
        id: 'job-99',
        name: 'tenant.created',
        data: makeTenantEvent(),
        attemptsMade: 5,
      } as never;

      await service.moveJobToDlq(fakeJob);

      // mockAdd es compartido por ambas Queue instances; se debe haber llamado
      expect(mockAdd).toHaveBeenCalledWith(
        'tenant.created',
        expect.objectContaining({ type: 'tenant.created' }),
        expect.objectContaining({ jobId: 'dlq:job-99' }),
      );
    });

    it('no propaga errores si la DLQ falla', async () => {
      mockAdd.mockRejectedValueOnce(new Error('DLQ Redis down'));
      const fakeJob = {
        id: 'job-100',
        name: 'tenant.created',
        data: makeTenantEvent(),
        attemptsMade: 5,
      } as never;

      await expect(service.moveJobToDlq(fakeJob)).resolves.toBeUndefined();
    });
  });
});
