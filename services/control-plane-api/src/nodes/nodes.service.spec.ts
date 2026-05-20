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
