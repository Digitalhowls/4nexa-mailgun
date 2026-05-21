import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MigrationService } from './migration.service';

// ─── Mock BullMQ ──────────────────────────────────────────────────────────────

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) })),
}));

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

  it('usa sourcePort=993 y sourceTls=true por defecto cuando no se proporcionan (líneas 108-111)', async () => {
    prisma.migrationJob.create.mockResolvedValue(makeJob());

    await service.createJob(
      {
        tenantId: uuid(),
        provider: 'GENERIC_IMAP',
        sourceHost: 'imap.example.com',
        // sin sourcePort ni sourceTls → usa defaults
        sourceUsername: 'u',
        sourcePassword: 'p',
      } as any,
      'uid',
    );

    const createCall = (prisma.migrationJob.create as jest.Mock).mock.calls[0][0].data;
    expect(createCall.sourcePort).toBe(993);
    expect(createCall.sourceTls).toBe(true);
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

  it('usa limit=50 y offset=0 por defecto cuando no se proporcionan (líneas 152-153)', async () => {
    prisma.migrationJob.findMany.mockResolvedValue([]);
    prisma.migrationJob.count.mockResolvedValue(0);

    await service.listJobs({} as any);

    expect(prisma.migrationJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
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

  it('calcula percentComplete correctamente cuando messagesTotal > 0 (cubre línea 457)', async () => {
    const job = makeJob({ messagesTotal: 200, messagesImported: 50 });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    const dto = await service.getJob(job.id);
    expect((dto.progress as Record<string, unknown>)['percentComplete']).toBe(25);
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

  it('no lanza si count es 0', async () => {
    prisma.migrationJob.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.cleanOldJobs()).resolves.not.toThrow();
  });
});

// ─── NotFoundException en pause/resume/cancel ─────────────────────────────────

describe('MigrationService.pauseJob / resumeJob / cancelJob — NotFoundException', () => {
  it('pauseJob lanza NotFoundException si el job no existe', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(null);
    await expect(service.pauseJob(uuid(), 'uid')).rejects.toThrow(NotFoundException);
  });

  it('resumeJob lanza NotFoundException si el job no existe', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(null);
    await expect(service.resumeJob(uuid(), 'uid')).rejects.toThrow(NotFoundException);
  });

  it('cancelJob lanza NotFoundException si el job no existe', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(null);
    await expect(service.cancelJob(uuid(), 'uid')).rejects.toThrow(NotFoundException);
  });

  it('cancelJob lanza BadRequestException si el job ya está CANCELLED', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'CANCELLED' }));
    await expect(service.cancelJob(uuid(), 'uid')).rejects.toThrow(BadRequestException);
  });
});

// ─── listJobs con filtros ─────────────────────────────────────────────────────

describe('MigrationService.listJobs — filtros', () => {
  it('filtra por tenantId, provider y status', async () => {
    prisma.migrationJob.findMany.mockResolvedValue([]);
    prisma.migrationJob.count.mockResolvedValue(0);

    await service.listJobs({ tenantId: 't1', provider: 'GOOGLE_WORKSPACE', status: 'RUNNING', limit: 10, offset: 0 });

    const whereArg = prisma.migrationJob.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ tenantId: 't1', provider: 'GOOGLE_WORKSPACE', status: 'RUNNING' });
  });
});

// ─── onModuleDestroy ──────────────────────────────────────────────────────────

describe('MigrationService.onModuleDestroy', () => {
  it('cierra worker y queue sin errores', async () => {
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});

// ─── processJobStep ───────────────────────────────────────────────────────────

describe('MigrationService.processJobStep', () => {
  // Helper para cifrar la contraseña con la misma llave que el config mock
  async function makeEncryptedPassword(): Promise<string> {
    const { createHash, createCipheriv, randomBytes } = await import('crypto');
    const key = createHash('sha256').update('test-key-32-chars-000000000000000').digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let enc = cipher.update('plain-password', 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${enc}`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.publish = jest.fn().mockResolvedValue(undefined);
  });

  it('retorna sin hacer nada si el job no existe', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(null);
    await expect(service.processJobStep(uuid())).resolves.not.toThrow();
    expect(prisma.migrationJob.update).not.toHaveBeenCalled();
  });

  it('retorna sin hacer nada si el job está PAUSED', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'PAUSED' }));
    await service.processJobStep(uuid());
    expect(prisma.migrationJob.update).not.toHaveBeenCalled();
  });

  it('retorna sin hacer nada si el job está CANCELLED', async () => {
    prisma.migrationJob.findUnique.mockResolvedValue(makeJob({ status: 'CANCELLED' }));
    await service.processJobStep(uuid());
    expect(prisma.migrationJob.update).not.toHaveBeenCalled();
  });

  it('lanza Error si sourceEncryptedPassword tiene formato inválido (cubre línea 38)', async () => {
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: 'formato-invalido' });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING' });

    await expect(service.processJobStep(job.id)).rejects.toThrow('Formato de cifrado inválido');
  });

  it('marca el job como FAILED si el node-agent lanza', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING' });

    global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration.failed' }),
    );
  });

  it('marca FAILED con String(err) cuando el error no es instancia de Error (línea 290)', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING' });

    global.fetch = jest.fn().mockRejectedValue('string-error-not-Error') as unknown as typeof fetch;

    await service.processJobStep(job.id);

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'string-error-not-Error' }),
      }),
    );
  });

  it('marca FAILED si el node-agent responde con HTTP no-ok', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: jest.fn().mockResolvedValue('Bad Gateway'),
    }) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    const updateCall = prisma.migrationJob.update.mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === 'FAILED',
    );
    expect(updateCall).toBeDefined();
  });

  it('actualiza el progreso y re-encola si completed=false', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, messagesImported: 50, messagesTotal: 200 });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        messagesImported: 50,
        messagesTotal: 200,
        completed: false,
      }),
    }) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ messagesImported: 50, status: 'RUNNING' }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration.progress' }),
    );
    // Re-encola el próximo paso
    expect(queue.add).toHaveBeenCalled();
  });

  it('marca COMPLETED y publica migration.completed cuando completed=true', async () => {
    const encPwd = await makeEncryptedPassword();
    const startedAt = new Date(Date.now() - 5000);
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd, startedAt });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({
      ...job,
      messagesImported: 100,
      messagesTotal: 100,
      status: 'COMPLETED',
      startedAt,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        messagesImported: 100,
        messagesTotal: 100,
        completed: true,
      }),
    }) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    expect(prisma.migrationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration.completed' }),
    );
    // No re-encola cuando completa
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('usa durationMs=0 cuando updated.startedAt es null al completar (cubre línea 328)', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd, startedAt: null });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({
      ...job, messagesImported: 100, messagesTotal: 100, status: 'COMPLETED', startedAt: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: jest.fn().mockResolvedValue({ messagesImported: 100, messagesTotal: 100, completed: true }),
    }) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration.completed', durationMs: 0 }),
    );
  });

  it('emite advertencia de anomalía cuando se importan menos del 50% de mensajes', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'RUNNING', sourceEncryptedPassword: encPwd, startedAt: new Date() });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({
      ...job,
      messagesImported: 10,
      messagesTotal: 100,
      status: 'COMPLETED',
      startedAt: new Date(),
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        messagesImported: 10,
        messagesTotal: 100,
        completed: true,
      }),
    }) as unknown as typeof fetch;

    // Solo verifica que no lanza — la anomalía se loguea internamente
    await expect(service.processJobStep(job.id)).resolves.not.toThrow();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration.completed' }),
    );
  });

  it('primer processJobStep establece startedAt cuando no estaba definido', async () => {
    const encPwd = await makeEncryptedPassword();
    const job = makeJob({ status: 'PENDING', sourceEncryptedPassword: encPwd, startedAt: null });
    prisma.migrationJob.findUnique.mockResolvedValue(job);
    prisma.migrationJob.update.mockResolvedValue({ ...job, status: 'RUNNING', startedAt: new Date() });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ messagesImported: 5, messagesTotal: 50, completed: false }),
    }) as unknown as typeof fetch;

    await service.processJobStep(job.id);

    const firstUpdateCall = prisma.migrationJob.update.mock.calls[0][0];
    expect(firstUpdateCall.data.startedAt).toBeDefined();
  });
});

// ─── onModuleInit ─────────────────────────────────────────────────────────────

describe('MigrationService.onModuleInit()', () => {
  it('crea Worker y Queue, y registra handler de fallo', () => {
    const { Worker } = require('bullmq');
    const workerInstancesBefore = Worker.mock.instances.length;

    // Limpiar queue/worker inyectados para forzar que onModuleInit los cree
    (service as any).queue = undefined;
    (service as any).worker = undefined;

    service.onModuleInit();

    // Se creó una nueva instancia de Worker
    expect(Worker.mock.instances.length).toBeGreaterThan(workerInstancesBefore);
    const mockWorkerInstance = Worker.mock.results[Worker.mock.results.length - 1].value;
    expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));

    // Invocar el callback de 'failed' para cubrir su cuerpo
    const failedCb = (mockWorkerInstance.on as jest.Mock).mock.calls.find(
      ([e]: [string]) => e === 'failed',
    )[1];
    // job con datos — cubre el caso normal
    failedCb({ data: { migrationJobId: 'job-1' } }, new Error('test'));
    // job null — cubre la rama job?.data?.migrationJobId con nullish
    failedCb(null, new Error('job is null'));
  });

  it('ejecuta el procesador del Worker al ser invocado (cubre línea 81)', async () => {
    const { Worker } = require('bullmq');

    (service as any).queue = undefined;
    (service as any).worker = undefined;

    service.onModuleInit();

    // Capturar el procesador (2do argumento del constructor Worker)
    const processorFn = Worker.mock.calls[Worker.mock.calls.length - 1][1] as (job: { data: { migrationJobId: string } }) => Promise<void>;

    // Stubs para processJobStep
    jest.spyOn(service as any, 'processJobStep').mockResolvedValue(undefined);

    await processorFn({ data: { migrationJobId: 'job-x' } });
    expect((service as any).processJobStep).toHaveBeenCalledWith('job-x');
  });
});
