import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MemoryCellScope } from '@prisma/client';
import { BrainService } from './brain.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeCell = (overrides: Record<string, unknown> = {}) => ({
  id: 'cell-uuid-1',
  tenantId: 'tenant-1',
  scope: 'REPUTATION' as MemoryCellScope,
  key: 'node:node-1:score',
  payload: { score: 80 },
  expiresAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  createdBy: 'system',
  version: 1,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

let prisma: {
  $transaction: jest.Mock;
  memoryCell: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
};

let eventBus: { publish: jest.Mock };
let service: BrainService;

beforeEach(async () => {
  prisma = {
    $transaction: jest.fn((fn) => fn(prisma)),
    memoryCell: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        provide: BrainService,
        useFactory: () =>
          new BrainService(prisma as any, eventBus as any),
      },
    ],
  }).compile();

  service = module.get<BrainService>(BrainService);
});

// ─── upsertCell — crear nueva ─────────────────────────────────────────────────

describe('upsertCell — crear nueva', () => {
  it('crea la celda cuando no existe', async () => {
    const cell = makeCell();
    prisma.memoryCell.findFirst.mockResolvedValue(null);
    prisma.memoryCell.create.mockResolvedValue(cell);

    const result = await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      key: 'node:node-1:score',
      payload: { score: 80 },
    });

    expect(prisma.memoryCell.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('cell-uuid-1');
    expect(result.scope).toBe('REPUTATION');
  });

  it('publica evento brain.cell_written tras crear', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);
    prisma.memoryCell.create.mockResolvedValue(makeCell());

    await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      key: 'node:node-1:score',
      payload: { score: 80 },
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'brain.cell_written', scope: 'REPUTATION' }),
    );
  });
});

// ─── upsertCell — actualizar existente ───────────────────────────────────────

describe('upsertCell — actualizar existente', () => {
  it('incrementa version y actualiza payload', async () => {
    const existing = makeCell();
    const updated = makeCell({ version: 2, payload: { score: 60 } });
    prisma.memoryCell.findFirst.mockResolvedValue(existing);
    prisma.memoryCell.update.mockResolvedValue(updated);

    const result = await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      key: 'node:node-1:score',
      payload: { score: 60 },
    });

    expect(prisma.memoryCell.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
    expect(result.version).toBe(2);
  });
});

// ─── upsertCell — anomalías de reputación ────────────────────────────────────

describe('upsertCell — anomalía REPUTATION', () => {
  it('publica brain.anomaly_detected cuando score < 40', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);
    prisma.memoryCell.create.mockResolvedValue(
      makeCell({ payload: { score: 30 } }),
    );

    await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      key: 'node:node-1:score',
      payload: { score: 30 },
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'brain.anomaly_detected', scope: 'REPUTATION' }),
    );
  });

  it('no publica anomaly_detected cuando score >= 40', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);
    prisma.memoryCell.create.mockResolvedValue(makeCell({ payload: { score: 40 } }));

    await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      key: 'node:node-1:score',
      payload: { score: 40 },
    });

    const anomalyCall = eventBus.publish.mock.calls.find(
      ([e]: [{ type: string }]) => e.type === 'brain.anomaly_detected',
    );
    expect(anomalyCall).toBeUndefined();
  });
});

// ─── upsertCell — anomalías de entregabilidad ─────────────────────────────────

describe('upsertCell — anomalía DELIVERABILITY', () => {
  it('publica anomaly cuando bounceRate > 0.10', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);
    prisma.memoryCell.create.mockResolvedValue(
      makeCell({ scope: 'DELIVERABILITY' as MemoryCellScope, payload: { bounceRate: 0.15 } }),
    );

    await service.upsertCell({
      tenantId: 'tenant-1',
      scope: 'DELIVERABILITY',
      key: 'domain:acme.com:bounce',
      payload: { bounceRate: 0.15 },
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'brain.anomaly_detected', scope: 'DELIVERABILITY' }),
    );
  });
});

// ─── getCell ─────────────────────────────────────────────────────────────────

describe('getCell', () => {
  it('devuelve la celda si existe y no ha expirado', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(makeCell());

    const result = await service.getCell('tenant-1', 'REPUTATION', 'node:node-1:score');
    expect(result.id).toBe('cell-uuid-1');
  });

  it('lanza NotFoundException si la celda no existe', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);

    await expect(
      service.getCell('tenant-1', 'REPUTATION', 'no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── queryCells ───────────────────────────────────────────────────────────────

describe('queryCells', () => {
  it('retorna items paginados con el total', async () => {
    const cells = [makeCell(), makeCell({ id: 'cell-uuid-2' })];
    prisma.memoryCell.findMany.mockResolvedValue(cells);
    prisma.memoryCell.count.mockResolvedValue(2);

    const result = await service.queryCells({
      tenantId: 'tenant-1',
      includeExpired: false,
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('filtra por scope si se indica', async () => {
    prisma.memoryCell.findMany.mockResolvedValue([makeCell()]);
    prisma.memoryCell.count.mockResolvedValue(1);

    await service.queryCells({
      tenantId: 'tenant-1',
      scope: 'REPUTATION',
      includeExpired: false,
      limit: 50,
      offset: 0,
    });

    expect(prisma.memoryCell.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scope: 'REPUTATION' }),
      }),
    );
  });
});

// ─── deleteCell ───────────────────────────────────────────────────────────────

describe('deleteCell', () => {
  it('elimina la celda correctamente', async () => {
    const cell = makeCell();
    prisma.memoryCell.findFirst.mockResolvedValue(cell);
    prisma.memoryCell.delete.mockResolvedValue(cell);

    await expect(
      service.deleteCell({ tenantId: 'tenant-1', scope: 'REPUTATION', key: 'node:node-1:score' }),
    ).resolves.toBeUndefined();

    expect(prisma.memoryCell.delete).toHaveBeenCalledWith({ where: { id: cell.id } });
  });

  it('lanza NotFoundException si la celda no existe', async () => {
    prisma.memoryCell.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteCell({ tenantId: 'tenant-1', scope: 'REPUTATION', key: 'no-existe' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── deleteTenantCells ────────────────────────────────────────────────────────

describe('deleteTenantCells', () => {
  it('elimina todas las celdas del tenant y devuelve el count', async () => {
    prisma.memoryCell.deleteMany.mockResolvedValue({ count: 5 });

    const count = await service.deleteTenantCells('tenant-1');
    expect(count).toBe(5);
  });
});

// ─── sweepExpiredCells ────────────────────────────────────────────────────────

describe('sweepExpiredCells', () => {
  it('invoca deleteMany con filtro expiresAt < now', async () => {
    prisma.memoryCell.deleteMany.mockResolvedValue({ count: 3 });

    await service.sweepExpiredCells();

    expect(prisma.memoryCell.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: expect.any(Object) }),
      }),
    );
  });
});
