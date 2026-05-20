import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MigrationService } from './migration.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const uuid = () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    tenantId: uuid(),
    mailboxId: null,
    provider: 'GENERIC_IMAP',
    status: 'PENDING',
    sourceHost: 'imap.example.com',
    sourcePort: 993,
    sourceUsername: 'user@example.com',
    sourceEncryptedPassword: 'enc-placeholder',
    sourceTls: true,
    foldersTotal: 0,
    foldersImported: 0,
    messagesTotal: 0,
    messagesImported: 0,
    bytesTotal: BigInt(0),
    bytesImported: BigInt(0),
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    createdBy: 'user-id',
    ...overrides,
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

let prisma: {
  $transaction: jest.Mock;
  migrationJob: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

let eventBus: { publish: jest.Mock };
let audit: { log: jest.Mock };
let redis: { client: Record<string, unknown> };
let config: { get: jest.Mock };
let queue: { add: jest.Mock; close: jest.Mock };
let worker: { on: jest.Mock; close: jest.Mock };

let service: MigrationService;

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  prisma = {
    $transaction: jest.fn((arr: unknown[]) => Promise.all(arr)),
    migrationJob: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
  audit = { log: jest.fn().mockResolvedValue(undefined) };
  redis = { client: {} };
  config = {
    get: jest.fn((key: string) => {
      if (key === 'DKIM_ENCRYPTION_KEY') return 'test-key-32-chars-000000000000000';
      if (key === 'NODE_AGENT_BASE_URL') return 'http://localhost:9001';
      return undefined;
    }),
  };

  queue = { add: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
  worker = {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        provide: MigrationService,
        useFactory: () => {
          const svc = new MigrationService(
            prisma as any,
            eventBus as any,
            audit as any,
            redis as any,
            config as any,
          );
          // Inyectar queue/worker pre-construidos para no depender de BullMQ/Redis
          (svc as any).queue = queue;
          (svc as any).worker = worker;
          return svc;
        },
      },
    ],
  }).compile();

  service = module.get(MigrationService);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MigrationService.createJob', () => {
  it('cifra la contraseña antes de persistir', async () => {
    const job = makeJob();
    prisma.migrationJob.create.mockResolvedValue(job);

    await service.createJob(
      {
        tenantId: uuid(),
        provider: 'GENERIC_IMAP',
        sourceHost: 'imap.example.com',
        sourcePort: 993,
        sourceUsername: 'user@example.com',
        sourcePassword: 'my-secret',
        sourceTls: true,
      },
      'user-id',
    );

    const createCall = prisma.migrationJob.create.mock.calls[0][0].data;
    // La contraseña almacenada NUNCA debe ser texto plano
    expect(createCall.sourceEncryptedPassword).not.toBe('my-secret');
    // Debe tener el formato iv:tag:enc
    expect(createCall.sourceEncryptedPassword).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('encola un job BullMQ al crear', async () => {
    prisma.migrationJob.create.mockResolvedValue(makeJob());
    await service.createJob(
      {
        tenantId: uuid(),
        provider: 'GENERIC_IMAP',
        sourceHost: 'imap.example.com',
        sourcePort: 993,
        sourceUsername: 'u',
        sourcePassword: 'p',
        sourceTls: true,
      },
      'uid',
    );

    expect(queue.add).toHaveBeenCalledWith('process', expect.objectContaining({ migrationJobId: expect.any(String) }), expect.any(Object));
  });

  it('publica evento migration.started', async () => {
    prisma.migrationJob.create.mockResolvedValue(makeJob());
    await service.createJob(
      {
        tenantId: uuid(),
        provider: 'GENERIC_IMAP',
        sourceHost: 'imap.example.com',
        sourcePort: 993,
        sourceUsername: 'u',
        sourcePassword: 'p',
        sourceTls: true,
      },
      'uid',
    );

    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'migration.started' }));
  });

  it('registra en auditoría', async () => {
    prisma.migrationJob.create.mockResolvedValue(makeJob());
    await service.createJob(
      {
        tenantId: uuid(),
        provider: 'GOOGLE_WORKSPACE',
        sourceHost: 'imap.gmail.com',
        sourcePort: 993,
        sourceUsername: 'u@domain.com',
        sourcePassword: 'p',
        sourceTls: true,
      },
      'uid',
    );

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'migration.job.created' }));
  });
});

describe('MigrationService.listJobs', () => {
  it('devuelve la lista paginada', async () => {
    const jobs = [makeJob(), makeJob()];
    prisma.migrationJob.findMany.mockResolvedValue(jobs);
    prisma.migrationJob.count.mockResolvedValue(2);

    const result = await service.listJobs({ limit: 50, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });
});

describe('MigrationService.getJob', () => {
  it('lanza NotFoundException si el job no existe', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(null);
    await expect(service.getJob(uuid())).rejects.toThrow(NotFoundException);
  });

  it('devuelve el DTO sin la contraseña cifrada expuesta directamente', async () => {
    const job = makeJob();
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    const dto = await service.getJob(job.id);
    expect((dto as Record<string, unknown>)['sourceEncryptedPassword']).toBeUndefined();
  });
});

describe('MigrationService.pauseJob', () => {
  it('lanza BadRequestException si el job no está RUNNING', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'PENDING' }));
    await expect(service.pauseJob(uuid(), 'uid')).rejects.toThrow(BadRequestException);
  });

  it('actualiza el estado a PAUSED', async () => {
    const job = makeJob({ status: 'RUNNING' });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'PAUSED' });

    const result = await service.pauseJob(job.id, 'uid');

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAUSED' }) }),
    );
    expect(result.status).toBe('PAUSED');
  });
});

describe('MigrationService.resumeJob', () => {
  it('lanza BadRequestException si el job no está PAUSED', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'RUNNING' }));
    await expect(service.resumeJob(uuid(), 'uid')).rejects.toThrow(BadRequestException);
  });

  it('re-encola el job al reanudar', async () => {
    const job = makeJob({ status: 'PAUSED' });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING' });

    await service.resumeJob(job.id, 'uid');

    expect(queue.add).toHaveBeenCalled();
  });
});

describe('MigrationService.cancelJob', () => {
  it('lanza BadRequestException si el job ya está COMPLETED', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'COMPLETED' }));
    await expect(service.cancelJob(uuid(), 'uid')).rejects.toThrow(BadRequestException);
  });

  it('publica migration.failed al cancelar', async () => {
    const job = makeJob({ status: 'RUNNING' });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'CANCELLED' });

    await service.cancelJob(job.id, 'uid');

    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'migration.failed' }));
  });
});

describe('MigrationService.cleanOldJobs', () => {
  it('elimina jobs terminados hace más de 30 días', async () => {
    prisma.migrationJob.deleteMany.mockResolvedValue({ count: 3 });
    await service.cleanOldJobs();
    expect(prisma.migrationJob.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['COMPLETED', 'CANCELLED'] } }),
      }),
    );
  });
});
