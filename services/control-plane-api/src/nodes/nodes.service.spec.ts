/**
 * Tests unitarios del NodesService — métodos de mTLS (§17.3).
 * Los métodos CRUD de nodes ya son cubiertos por el resto del servicio.
 * Aquí nos centramos en enrollNodeCert, rotateCert y getActiveCert.
 */
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { NodesService } from './nodes.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NodeAgentClient } from '../node-agent/node-agent.client';
import type { ConfigEngineService } from '@4nexa/config-engine';
import type { PkiService, NodeEnrollmentResult } from '../pki/pki.service';
import type { EventBusService } from '../event-bus/event-bus.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_NODE = {
  id: 'aaaa0000-0000-0000-0000-000000000001',
  hostname: 'mail-node-01.test.internal',
  status: 'ACTIVE',
  provider: 'hetzner',
  region: 'eu-central-1',
  ipAddress: '10.0.0.1',
  reputationScore: 100,
  capacityScore: 95,
  lastHealthAt: new Date(),
  lastAgentAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const FAKE_CERT_ROW = {
  id: 'cccc0000-0000-0000-0000-000000000001',
  nodeId: FAKE_NODE.id,
  certPem: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----\n',
  fingerprint: 'a'.repeat(64),
  serialNumber: 'ABCDEF0102030405',
  issuedAt: new Date('2025-01-01'),
  expiresAt: new Date('2026-01-01'),
  revokedAt: null,
};

const MOCK_ENROLLMENT: NodeEnrollmentResult = {
  agentCertPem: '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----\n',
  agentKeyPem: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n',
  caCertPem: '-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----\n',
  fingerprint: 'b'.repeat(64),
  serialNumber: 'DEAD00BEEF000001',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
};

function makeDeps(overrides: {
  nodeExists?: boolean;
  pkiEnabled?: boolean;
  activeCert?: typeof FAKE_CERT_ROW | null;
} = {}) {
  const { nodeExists = true, pkiEnabled = true, activeCert = FAKE_CERT_ROW } = overrides;

  const prisma = {
    node: {
      findUnique: jest.fn().mockResolvedValue(nodeExists ? FAKE_NODE : null),
    },
    nodeCertificate: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue(FAKE_CERT_ROW),
      findFirst: jest.fn().mockResolvedValue(activeCert),
    },
  } as unknown as PrismaService;

  const agentClient = {} as unknown as NodeAgentClient;
  const configEngine = {} as unknown as ConfigEngineService;

  const pki = {
    isEnabled: jest.fn().mockReturnValue(pkiEnabled),
    enrollNode: jest.fn().mockResolvedValue(MOCK_ENROLLMENT),
    getCaCertPem: jest.fn().mockReturnValue(MOCK_ENROLLMENT.caCertPem),
  } as unknown as PkiService;

  const eventBus = {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;

  const svc = new NodesService(prisma, agentClient, configEngine, pki, eventBus);
  return { svc, prisma, pki };
}

// ─── enrollNodeCert ───────────────────────────────────────────────────────────

describe('NodesService.enrollNodeCert()', () => {
  it('lanza NotFoundException cuando el nodo no existe', async () => {
    const { svc } = makeDeps({ nodeExists: false });
    await expect(svc.enrollNodeCert(FAKE_NODE.id)).rejects.toThrow(NotFoundException);
  });

  it('lanza UnprocessableEntityException cuando PKI no está habilitada', async () => {
    const { svc } = makeDeps({ pkiEnabled: false });
    await expect(svc.enrollNodeCert(FAKE_NODE.id)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('revoca certs anteriores antes de emitir el nuevo', async () => {
    const { svc, prisma } = makeDeps();
    await svc.enrollNodeCert(FAKE_NODE.id);
    expect((prisma.nodeCertificate as any).updateMany).toHaveBeenCalledWith({
      where: { nodeId: FAKE_NODE.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('llama a pki.enrollNode con el id y hostname correctos', async () => {
    const { svc, pki } = makeDeps();
    await svc.enrollNodeCert(FAKE_NODE.id);
    expect((pki as any).enrollNode).toHaveBeenCalledWith(FAKE_NODE.id, FAKE_NODE.hostname);
  });

  it('persiste el certificado en BD', async () => {
    const { svc, prisma } = makeDeps();
    await svc.enrollNodeCert(FAKE_NODE.id);
    expect((prisma.nodeCertificate as any).create).toHaveBeenCalledWith({
      data: {
        nodeId: FAKE_NODE.id,
        certPem: MOCK_ENROLLMENT.agentCertPem,
        serialNumber: MOCK_ENROLLMENT.serialNumber,
        fingerprint: MOCK_ENROLLMENT.fingerprint,
        expiresAt: MOCK_ENROLLMENT.expiresAt,
      },
    });
  });

  it('devuelve el NodeEnrollmentResult completo (incluyendo agentKeyPem)', async () => {
    const { svc } = makeDeps();
    const result = await svc.enrollNodeCert(FAKE_NODE.id);
    expect(result).toMatchObject({
      agentCertPem: MOCK_ENROLLMENT.agentCertPem,
      agentKeyPem: MOCK_ENROLLMENT.agentKeyPem,
      caCertPem: MOCK_ENROLLMENT.caCertPem,
      fingerprint: MOCK_ENROLLMENT.fingerprint,
      serialNumber: MOCK_ENROLLMENT.serialNumber,
    });
  });
});

// ─── rotateCert ───────────────────────────────────────────────────────────────

describe('NodesService.rotateCert()', () => {
  it('delega en enrollNodeCert (mismo comportamiento)', async () => {
    const { svc } = makeDeps();
    const enrollSpy = jest
      .spyOn(svc, 'enrollNodeCert')
      .mockResolvedValue(MOCK_ENROLLMENT);
    await svc.rotateCert(FAKE_NODE.id);
    expect(enrollSpy).toHaveBeenCalledWith(FAKE_NODE.id);
  });
});

// ─── getActiveCert ────────────────────────────────────────────────────────────

describe('NodesService.getActiveCert()', () => {
  it('lanza NotFoundException cuando el nodo no existe', async () => {
    const { svc } = makeDeps({ nodeExists: false });
    await expect(svc.getActiveCert(FAKE_NODE.id)).rejects.toThrow(NotFoundException);
  });

  it('devuelve null cuando no hay certificado activo', async () => {
    const { svc } = makeDeps({ activeCert: null });
    const result = await svc.getActiveCert(FAKE_NODE.id);
    expect(result).toBeNull();
  });

  it('devuelve los campos del cert activo (sin agentKeyPem)', async () => {
    const { svc } = makeDeps();
    const result = await svc.getActiveCert(FAKE_NODE.id);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      certPem: FAKE_CERT_ROW.certPem,
      fingerprint: FAKE_CERT_ROW.fingerprint,
      serialNumber: FAKE_CERT_ROW.serialNumber,
    });
    // La clave privada nunca debe aparecer
    expect(result).not.toHaveProperty('agentKeyPem');
  });
});

// ─── CRUD básico ──────────────────────────────────────────────────────────────

import {
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

const NODE_ID = FAKE_NODE.id;

function makeCrudDeps(opts: { nodeExists?: boolean; hostnameConflict?: boolean } = {}) {
  const { nodeExists = true, hostnameConflict = false } = opts;
  const prisma = {
    node: {
      findUnique: jest.fn().mockResolvedValue(hostnameConflict ? FAKE_NODE : (nodeExists ? FAKE_NODE : null)),
      findMany: jest.fn().mockResolvedValue([FAKE_NODE]),
      create: jest.fn().mockResolvedValue(FAKE_NODE),
      update: jest.fn().mockResolvedValue(FAKE_NODE),
      count: jest.fn().mockResolvedValue(1),
    },
    nodeCertificate: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;

  const agentClient = {
    healthCheck: jest.fn().mockResolvedValue({ data: { overallStatus: 'healthy', diskUsedPercent: 30 } }),
  } as unknown as NodeAgentClient;

  const configEngine = {
    applyNodeConfig: jest.fn().mockResolvedValue({ configVersion: 1, appliedSections: ['postfix'] }),
    validateNodeConfig: jest.fn().mockResolvedValue({ valid: true }),
  } as unknown as ConfigEngineService;

  const pki = {
    isEnabled: jest.fn().mockReturnValue(true),
    enrollNode: jest.fn().mockResolvedValue(MOCK_ENROLLMENT),
    getCaCertPem: jest.fn().mockReturnValue(''),
  } as unknown as PkiService;

  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;

  const svc = new NodesService(prisma, agentClient, configEngine, pki, eventBus);
  return { svc, prisma, agentClient, configEngine };
}

describe('NodesService.create()', () => {
  it('crea un nodo correctamente', async () => {
    const { svc, prisma } = makeCrudDeps({ hostnameConflict: false });
    (prisma.node.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await svc.create({ hostname: 'node01.empresa.com', ipV4: '10.0.0.1', provider: 'hetzner', region: 'eu-central', maxTenants: 50 });
    expect(result).toMatchObject({ id: NODE_ID });
  });

  it('lanza ConflictException si el hostname ya existe', async () => {
    const { svc } = makeCrudDeps({ hostnameConflict: true });
    await expect(svc.create({ hostname: 'node01.empresa.com', ipV4: '10.0.0.1', provider: 'hetzner', region: 'eu-central', maxTenants: 50 })).rejects.toThrow(ConflictException);
  });
});

describe('NodesService.findAll()', () => {
  it('devuelve lista paginada de nodos', async () => {
    const { svc } = makeCrudDeps();
    const result = await svc.findAll({ page: 1, pageSize: 10 });
    expect(result).toMatchObject({ items: [FAKE_NODE], total: 1 });
  });

  it('filtra por status, provider y region cuando se proporcionan', async () => {
    const { svc, prisma } = makeCrudDeps();
    await svc.findAll({ page: 1, pageSize: 10, status: 'ACTIVE' as any, provider: 'hetzner', region: 'eu-central' });
    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', provider: 'hetzner', region: 'eu-central' }),
      }),
    );
  });
});

describe('NodesService.findOne()', () => {
  it('devuelve el nodo si existe', async () => {
    const { svc } = makeCrudDeps();
    const result = await svc.findOne(NODE_ID);
    expect(result.id).toBe(NODE_ID);
  });

  it('lanza NotFoundException si no existe', async () => {
    const { svc } = makeCrudDeps({ nodeExists: false });
    await expect(svc.findOne('no-existe')).rejects.toThrow(NotFoundException);
  });
});

describe('NodesService.update()', () => {
  it('actualiza el nodo correctamente', async () => {
    const { svc } = makeCrudDeps();
    const result = await svc.update(NODE_ID, { maxTenants: 100 });
    expect(result).toMatchObject({ id: NODE_ID });
  });
});

describe('NodesService.setMaintenance()', () => {
  it('activa modo mantenimiento en nodo ACTIVE', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, status: 'MAINTENANCE' });
    const result = await svc.setMaintenance(NODE_ID, true);
    expect(result.status).toBe('MAINTENANCE');
  });

  it('desactiva modo mantenimiento (maintenance=false → ACTIVE)', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, status: 'ACTIVE' });
    await svc.setMaintenance(NODE_ID, false);
    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
  });

  it('lanza BadRequestException en nodo OFFLINE', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.findUnique as jest.Mock).mockResolvedValue({ ...FAKE_NODE, status: 'OFFLINE' });
    await expect(svc.setMaintenance(NODE_ID, true)).rejects.toThrow(BadRequestException);
  });
});

describe('NodesService.pushConfig()', () => {
  it('empuja configuración a nodo ACTIVE', async () => {
    const { svc } = makeCrudDeps();
    const result = await svc.pushConfig(NODE_ID);
    expect(result).toMatchObject({ configVersion: 1 });
  });

  it('lanza BadRequestException para nodo OFFLINE', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.findUnique as jest.Mock).mockResolvedValue({ ...FAKE_NODE, status: 'OFFLINE' });
    await expect(svc.pushConfig(NODE_ID)).rejects.toThrow(BadRequestException);
  });
});

describe('NodesService.validateConfig()', () => {
  it('valida la configuración del nodo', async () => {
    const { svc } = makeCrudDeps();
    const result = await svc.validateConfig(NODE_ID);
    expect(result).toMatchObject({ valid: true });
  });
});

describe('NodesService.reportAgentPing()', () => {
  it('registra ping del agente y actualiza scores', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, reputationScore: 100 });
    const result = await svc.reportAgentPing(NODE_ID);
    expect(result.reputationScore).toBe(100);
  });

  it('emite evento node.unhealthy si el agente reporta degradado', async () => {
    const { prisma } = makeCrudDeps();
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
    const agentClient = {
      healthCheck: jest.fn().mockResolvedValue({ data: { overallStatus: 'degraded', diskUsedPercent: 80 } }),
    } as unknown as NodeAgentClient;
    const configEngine = { applyNodeConfig: jest.fn(), validateNodeConfig: jest.fn() } as unknown as ConfigEngineService;
    const pki = { isEnabled: jest.fn().mockReturnValue(true), enrollNode: jest.fn(), getCaCertPem: jest.fn() } as unknown as PkiService;
    const svc2 = new NodesService(prisma, agentClient, configEngine, pki, eventBus);
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, reputationScore: 60 });
    await svc2.reportAgentPing(NODE_ID);
    expect((eventBus as any).publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'node.unhealthy' }));
  });

  it('asigna reputationScore=20 cuando overallStatus no es healthy ni degraded', async () => {
    const { prisma } = makeCrudDeps();
    const agentClient = {
      healthCheck: jest.fn().mockResolvedValue({ data: { overallStatus: 'offline', diskUsedPercent: 50 } }),
    } as unknown as NodeAgentClient;
    const configEngine = { applyNodeConfig: jest.fn(), validateNodeConfig: jest.fn() } as unknown as ConfigEngineService;
    const pki = { isEnabled: jest.fn().mockReturnValue(true), enrollNode: jest.fn(), getCaCertPem: jest.fn() } as unknown as PkiService;
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
    const svc3 = new NodesService(prisma, agentClient, configEngine, pki, eventBus);
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, reputationScore: 20 });
    await svc3.reportAgentPing(NODE_ID);
    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reputationScore: 20 }) }),
    );
  });

  it('asigna capacityScore=50 cuando diskUsedPercent es undefined', async () => {
    const { prisma } = makeCrudDeps();
    const agentClient = {
      healthCheck: jest.fn().mockResolvedValue({ data: { overallStatus: 'healthy' } }),
    } as unknown as NodeAgentClient;
    const configEngine = { applyNodeConfig: jest.fn(), validateNodeConfig: jest.fn() } as unknown as ConfigEngineService;
    const pki = { isEnabled: jest.fn().mockReturnValue(true), enrollNode: jest.fn(), getCaCertPem: jest.fn() } as unknown as PkiService;
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;
    const svc4 = new NodesService(prisma, agentClient, configEngine, pki, eventBus);
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, capacityScore: 50 });
    await svc4.reportAgentPing(NODE_ID);
    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ capacityScore: 50 }) }),
    );
  });
});

describe('NodesService.updateHealth()', () => {
  it('actualiza reputationScore y capacityScore del nodo', async () => {
    const { svc, prisma } = makeCrudDeps();
    (prisma.node.update as jest.Mock).mockResolvedValue({ ...FAKE_NODE, reputationScore: 90, capacityScore: 80 });

    const result = await svc.updateHealth(NODE_ID, 90, 80);

    expect(prisma.node.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reputationScore: 90, capacityScore: 80 }),
      }),
    );
    expect(result.reputationScore).toBe(90);
  });
});
