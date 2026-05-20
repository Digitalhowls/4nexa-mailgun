import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupType, BackupStatus } from '@4nexa/types';
import type { PrismaService } from '../prisma/prisma.service';
import type { NodeAgentClient } from '../node-agent/node-agent.client';
import type { EventBusService } from '../event-bus/event-bus.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(): PrismaService {
  return {
    node: { findUnique: jest.fn() },
    backupJob: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as unknown as PrismaService;
}

function makeAgentClient(): NodeAgentClient {
  return {
    backup: jest.fn(),
  } as unknown as NodeAgentClient;
}

function makeEventBus(): EventBusService {
  return { publish: jest.fn() } as unknown as EventBusService;
}

const MOCK_NODE = { id: 'node-uuid-1', hostname: 'mail.example.com' };

const MOCK_JOB = {
  id: 'job-uuid-1',
  nodeId: 'node-uuid-1',
  type: BackupType.FULL_NODE,
  status: BackupStatus.PENDING,
  createdAt: new Date(),
  snapshotId: null,
  sizeBytes: null,
  durationMs: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  verifiedAt: null,
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('BackupService', () => {
  let service: BackupService;
  let prisma: PrismaService;
  let agentClient: NodeAgentClient;
  let eventBus: EventBusService;

  beforeEach(() => {
    prisma = makePrisma();
    agentClient = makeAgentClient();
    eventBus = makeEventBus();
    service = new BackupService(prisma, agentClient, eventBus);
  });

  // ─── triggerBackup() ──────────────────────────────────────────────────────

  describe('triggerBackup()', () => {
    it('lanza NotFoundException si el nodo no existe', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.FULL_NODE }),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea job, llama al agente y devuelve job COMPLETED', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue(MOCK_JOB);
      (prisma.backupJob.update as jest.Mock)
        .mockResolvedValueOnce({ ...MOCK_JOB, status: BackupStatus.RUNNING, startedAt: new Date() })
        .mockResolvedValueOnce({ ...MOCK_JOB, status: BackupStatus.COMPLETED, completedAt: new Date(), snapshotId: 'snap-1', sizeBytes: BigInt(1024), durationMs: 500 });

      (agentClient.backup as jest.Mock).mockResolvedValue({
        success: true,
        data: { snapshotId: 'snap-1', sizeBytes: 1024, durationMs: 500 },
      });

      const result = await service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.FULL_NODE });

      expect(result.status).toBe(BackupStatus.COMPLETED);
      expect(result.snapshotId).toBe('snap-1');
      expect(agentClient.backup).toHaveBeenCalledWith('node-uuid-1', 'full', undefined, undefined);
    });

    it('publica evento backup.completed cuando el agente tiene éxito', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue(MOCK_JOB);
      (prisma.backupJob.update as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: BackupStatus.COMPLETED });
      (agentClient.backup as jest.Mock).mockResolvedValue({
        success: true,
        data: { snapshotId: 'snap-2', sizeBytes: 2048, durationMs: 300 },
      });

      await service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.FULL_NODE });

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'backup.completed', nodeId: 'node-uuid-1' }),
      );
    });

    it('marca job como FAILED y publica backup.failed cuando el agente lanza error', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue(MOCK_JOB);
      (prisma.backupJob.update as jest.Mock)
        .mockResolvedValueOnce({ ...MOCK_JOB, status: BackupStatus.RUNNING })
        .mockResolvedValueOnce({ ...MOCK_JOB, status: BackupStatus.FAILED, errorMessage: 'timeout' });
      (agentClient.backup as jest.Mock).mockRejectedValue(new Error('timeout'));

      const result = await service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.FULL_NODE });

      expect(result.status).toBe(BackupStatus.FAILED);
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'backup.failed', nodeId: 'node-uuid-1', reason: 'timeout' }),
      );
    });

    it('mapea BackupType.CONFIGURATION → tipo "config" para el agente', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue({ ...MOCK_JOB, type: BackupType.CONFIGURATION });
      (prisma.backupJob.update as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: BackupStatus.COMPLETED });
      (agentClient.backup as jest.Mock).mockResolvedValue({ success: true, data: { snapshotId: 'snap-cfg', sizeBytes: 100, durationMs: 50 } });

      await service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.CONFIGURATION });

      expect(agentClient.backup).toHaveBeenCalledWith('node-uuid-1', 'config', undefined, undefined);
    });

    it('mapea BackupType.MAILBOXES → tipo "mailboxes" para el agente', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue({ ...MOCK_JOB, type: BackupType.MAILBOXES });
      (prisma.backupJob.update as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: BackupStatus.COMPLETED });
      (agentClient.backup as jest.Mock).mockResolvedValue({ success: true, data: { snapshotId: 'snap-mb', sizeBytes: 4096, durationMs: 800 } });

      await service.triggerBackup({ nodeId: 'node-uuid-1', type: BackupType.MAILBOXES });

      expect(agentClient.backup).toHaveBeenCalledWith('node-uuid-1', 'mailboxes', undefined, undefined);
    });

    it('pasa targetPath y tenantId al agente si se proporcionan', async () => {
      (prisma.node.findUnique as jest.Mock).mockResolvedValue(MOCK_NODE);
      (prisma.backupJob.create as jest.Mock).mockResolvedValue(MOCK_JOB);
      (prisma.backupJob.update as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: BackupStatus.COMPLETED });
      (agentClient.backup as jest.Mock).mockResolvedValue({ success: true, data: { snapshotId: 'snap-t', sizeBytes: 512, durationMs: 200 } });

      await service.triggerBackup({
        nodeId: 'node-uuid-1',
        type: BackupType.TENANT,
        targetPath: '/backup/2026',
        tenantId: 'tenant-uuid-1',
      });

      expect(agentClient.backup).toHaveBeenCalledWith('node-uuid-1', 'full', '/backup/2026', 'tenant-uuid-1');
    });
  });

  // ─── listJobs() ──────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('devuelve lista paginada de jobs', async () => {
      const items = [MOCK_JOB];
      (prisma.backupJob.findMany as jest.Mock).mockResolvedValue(items);
      (prisma.backupJob.count as jest.Mock).mockResolvedValue(1);

      const result = await service.listJobs({ page: 1, pageSize: 20 });

      expect(result.items).toEqual(items);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('aplica filtros de nodeId y status si se proporcionan', async () => {
      (prisma.backupJob.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.backupJob.count as jest.Mock).mockResolvedValue(0);

      await service.listJobs({ nodeId: 'node-uuid-1', status: BackupStatus.FAILED, page: 1, pageSize: 10 });

      expect(prisma.backupJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { nodeId: 'node-uuid-1', status: BackupStatus.FAILED } }),
      );
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('devuelve el job si existe', async () => {
      (prisma.backupJob.findUnique as jest.Mock).mockResolvedValue(MOCK_JOB);

      const result = await service.findOne('job-uuid-1');
      expect(result).toEqual(MOCK_JOB);
    });

    it('lanza NotFoundException si el job no existe', async () => {
      (prisma.backupJob.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
