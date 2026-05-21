import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { EventProcessorService } from './event-processor.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { EventBusService } from './event-bus.service';
import type {
  NodeUnhealthyEvent,
  MailBouncedEvent,
  MailDeferredEvent,
  AbuseDetectedEvent,
} from './event-bus.types';

// ─── Mock de BullMQ ──────────────────────────────────────────────────────────

const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerOn = jest.fn();
let mockCapturedProcessor: ((job: { data: unknown; id?: string }) => Promise<void>) | undefined;

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_q: string, processor: any) => {
    mockCapturedProcessor = processor;
    return { on: mockWorkerOn, close: mockWorkerClose };
  }),
}));

// ─── Mocks de dependencias ────────────────────────────────────────────────────

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockTenantUpdate = jest.fn().mockResolvedValue({});

const mockNodeDelta = jest.fn();
const mockDomainDelta = jest.fn();
const mockTenantDelta = jest.fn();

const mockEventBusPublish = jest.fn().mockResolvedValue(undefined);
const mockEventBusMoveJobToDlq = jest.fn().mockResolvedValue(undefined);

function makeScoreResult(
  entityType: 'node' | 'domain' | 'tenant',
  entityId: string,
  prev: number,
  next: number,
  crossed = false,
) {
  return { entityType, entityId, previousScore: prev, newScore: next, thresholdCrossed: crossed };
}

function makeJob(data: unknown) {
  return {
    data,
    id: 'job-test',
    name: (data as { type: string }).type,
    attemptsMade: 1,
    opts: { attempts: 3 },
  };
}

describe('EventProcessorService', () => {
  let service: EventProcessorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCapturedProcessor = undefined;

    mockNodeDelta.mockResolvedValue(makeScoreResult('node', 'n1', 80, 60));
    mockDomainDelta.mockResolvedValue(makeScoreResult('domain', 'd1', 70, 68));
    mockTenantDelta.mockResolvedValue(makeScoreResult('tenant', 't1', 90, 60));

    const module = await Test.createTestingModule({
      providers: [
        EventProcessorService,
        { provide: RedisService, useValue: { client: {} } },
        { provide: AuditService, useValue: { log: mockAuditLog } },
        {
          provide: PrismaService,
          useValue: { tenant: { update: mockTenantUpdate } },
        },
        {
          provide: ReputationService,
          useValue: {
            applyNodeDelta: mockNodeDelta,
            applyDomainDelta: mockDomainDelta,
            applyTenantDelta: mockTenantDelta,
          },
        },
        {
          provide: EventBusService,
          useValue: {
            publish: mockEventBusPublish,
            moveJobToDlq: mockEventBusMoveJobToDlq,
          },
        },
      ],
    }).compile();

    service = module.get(EventProcessorService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ─── Ciclo de vida ────────────────────────────────────────────────────────

  describe('onModuleInit() / onModuleDestroy()', () => {
    it('crea el worker y captura el processor', () => {
      expect(mockCapturedProcessor).toBeDefined();
    });

    it('cierra el worker en onModuleDestroy', async () => {
      await service.onModuleDestroy();
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });

  // ─── process() — dispatcher ───────────────────────────────────────────────

  describe('process() — node.unhealthy', () => {
    it('delega en reputation.applyNodeDelta y audita el evento', async () => {
      const event: NodeUnhealthyEvent = {
        type: 'node.unhealthy',
        nodeId: 'n1',
        hostname: 'mail1.example.com',
        previousStatus: 'ACTIVE',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'node.unhealthy' }),
      );
      expect(mockNodeDelta).toHaveBeenCalledWith('n1', -20);
    });

    it('emite reputation.degraded cuando thresholdCrossed es true', async () => {
      mockNodeDelta.mockResolvedValue(
        makeScoreResult('node', 'n1', 50, 30, true),
      );
      const event: NodeUnhealthyEvent = {
        type: 'node.unhealthy',
        nodeId: 'n1',
        hostname: 'mail1.example.com',
        previousStatus: 'ACTIVE',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockEventBusPublish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'reputation.degraded', entityType: 'node' }),
      );
    });
  });

  describe('process() — mail.bounced', () => {
    it('delega en reputation.applyDomainDelta con delta -2', async () => {
      const event: MailBouncedEvent = {
        type: 'mail.bounced',
        messageId: 'msg-1',
        tenantId: 't1',
        domainId: 'd1',
        toAddress: 'user@example.com',
        nodeId: 'n1',
        bounceCode: '550',
        reason: 'User unknown',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockDomainDelta).toHaveBeenCalledWith('d1', -2);
      expect(mockAuditLog).toHaveBeenCalled();
    });
  });

  describe('process() — mail.deferred', () => {
    it('no ajusta score cuando retryCount < 3', async () => {
      const event: MailDeferredEvent = {
        type: 'mail.deferred',
        messageId: 'msg-2',
        tenantId: 't1',
        domainId: 'd1',
        toAddress: 'user@example.com',
        nodeId: 'n1',
        reason: 'greylisted',
        retryCount: 2,
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockDomainDelta).not.toHaveBeenCalled();
    });

    it('aplica delta -1 cuando retryCount >= 3', async () => {
      const event: MailDeferredEvent = {
        type: 'mail.deferred',
        messageId: 'msg-3',
        tenantId: 't1',
        domainId: 'd1',
        toAddress: 'user@example.com',
        nodeId: 'n1',
        reason: 'greylisted',
        retryCount: 3,
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockDomainDelta).toHaveBeenCalledWith('d1', -1);
    });
  });

  describe('process() — abuse.detected', () => {
    it('aplica delta -5 para severidad low', async () => {
      const event: AbuseDetectedEvent = {
        type: 'abuse.detected',
        tenantId: 't1',
        domainId: null,
        mailboxId: null,
        nodeId: null,
        severity: 'low',
        reason: 'heuristics',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockTenantDelta).toHaveBeenCalledWith('t1', -5);
      expect(mockTenantUpdate).not.toHaveBeenCalled();
    });

    it('aplica delta -15 para severidad high', async () => {
      const event: AbuseDetectedEvent = {
        type: 'abuse.detected',
        tenantId: 't1',
        domainId: null,
        mailboxId: null,
        nodeId: null,
        severity: 'high',
        reason: 'ml model',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockTenantDelta).toHaveBeenCalledWith('t1', -15);
    });

    it('suspende el tenant automáticamente con severidad critical', async () => {
      const event: AbuseDetectedEvent = {
        type: 'abuse.detected',
        tenantId: 't1',
        domainId: null,
        mailboxId: null,
        nodeId: null,
        severity: 'critical',
        reason: 'phishing detected',
        occurredAt: new Date().toISOString(),
      };

      await mockCapturedProcessor!(makeJob(event));

      expect(mockTenantDelta).toHaveBeenCalledWith('t1', -30);
      expect(mockTenantUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: expect.objectContaining({ status: 'SUSPENDED' }),
        }),
      );
    });
  });

  describe('process() — backup.completed / backup.failed / queue.threshold_exceeded', () => {
    it('procesa backup.completed sin modificar scores', async () => {
      const event = {
        type: 'backup.completed',
        nodeId: 'n1',
        snapshotId: 'snap-1',
        sizeBytes: 1024,
        occurredAt: new Date().toISOString(),
      };

      await expect(mockCapturedProcessor!(makeJob(event))).resolves.not.toThrow();
      expect(mockNodeDelta).not.toHaveBeenCalled();
    });

    it('procesa backup.failed sin lanzar excepciones', async () => {
      const event = {
        type: 'backup.failed',
        nodeId: 'n1',
        reason: 'disk full',
        occurredAt: new Date().toISOString(),
      };

      await expect(mockCapturedProcessor!(makeJob(event))).resolves.not.toThrow();
    });

    it('procesa queue.threshold_exceeded sin lanzar excepciones', async () => {
      const event = {
        type: 'queue.threshold_exceeded',
        nodeId: 'n1',
        queueSize: 5000,
        threshold: 3000,
        occurredAt: new Date().toISOString(),
      };

      await expect(mockCapturedProcessor!(makeJob(event))).resolves.not.toThrow();
    });
  });

  describe('process() — evento desconocido', () => {
    it('no lanza excepción para tipo de evento no manejado', async () => {
      const event = { type: 'unknown.event.type', occurredAt: new Date().toISOString() };

      await expect(mockCapturedProcessor!(makeJob(event))).resolves.not.toThrow();
    });
  });

  // ─── worker.on('failed') ──────────────────────────────────────────────────

  describe('worker.on("failed") handler', () => {
    it('no llama a moveJobToDlq cuando job es null', () => {
      const failedCb = (mockWorkerOn as jest.Mock).mock.calls.find(([e]: [string]) => e === 'failed')[1];
      failedCb(null, new Error('test error'));
      expect(mockEventBusMoveJobToDlq).not.toHaveBeenCalled();
    });

    it('no llama a moveJobToDlq cuando intentos no se han agotado', () => {
      const failedCb = (mockWorkerOn as jest.Mock).mock.calls.find(([e]: [string]) => e === 'failed')[1];
      failedCb(
        { id: 'j1', attemptsMade: 1, opts: { attempts: 3 }, name: 'ev.test', data: {} },
        new Error('retry'),
      );
      expect(mockEventBusMoveJobToDlq).not.toHaveBeenCalled();
    });

    it('llama a moveJobToDlq cuando los intentos se han agotado', () => {
      const failedCb = (mockWorkerOn as jest.Mock).mock.calls.find(([e]: [string]) => e === 'failed')[1];
      failedCb(
        { id: 'j2', attemptsMade: 3, opts: { attempts: 3 }, name: 'ev.exhausted', data: {} },
        new Error('exhausted'),
      );
      expect(mockEventBusMoveJobToDlq).toHaveBeenCalled();
    });

    it('usa 1 como valor por defecto de attempts cuando opts no lo define (rama ?? 1)', () => {
      const failedCb = (mockWorkerOn as jest.Mock).mock.calls.find(([e]: [string]) => e === 'failed')[1];
      jest.clearAllMocks();
      failedCb(
        { id: 'j3', attemptsMade: 1, opts: {}, name: 'ev.noOpts', data: {} },
        new Error('no opts'),
      );
      // attemptsMade(1) >= attempts ?? 1 → agotado
      expect(mockEventBusMoveJobToDlq).toHaveBeenCalled();
    });
  });

  // ─── worker.on('error') ───────────────────────────────────────────────────

  describe('worker.on("error") handler', () => {
    it('no lanza al recibir error del worker', () => {
      const errorCb = (mockWorkerOn as jest.Mock).mock.calls.find(([e]: [string]) => e === 'error')[1];
      expect(() => errorCb(new Error('worker error'))).not.toThrow();
    });
  });

  // ─── reputation.degraded ─────────────────────────────────────────────────

  describe('process() — reputation.degraded', () => {
    it('procesa reputation.degraded sin lanzar excepciones', async () => {
      const event = {
        type: 'reputation.degraded',
        entityType: 'domain',
        entityId: 'd1',
        previousScore: 80,
        newScore: 40,
        reason: 'bounce rate alta',
        occurredAt: new Date().toISOString(),
      };

      await expect(mockCapturedProcessor!(makeJob(event))).resolves.not.toThrow();
    });
  });
});
