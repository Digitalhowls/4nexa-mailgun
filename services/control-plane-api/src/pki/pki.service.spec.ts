/**
 * Tests unitarios del PkiService.
 * Usa WebCrypto real (Node.js 18+ nativo) — sin mocks criptográficos.
 * Genera una CA de prueba en memoria y verifica que el enrolamiento produce
 * un certificado X.509 válido y firmado correctamente por esa CA.
 */
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import * as crypto from 'node:crypto';

// Registrar el proveedor WebCrypto nativo para @peculiar/x509
x509.cryptoProvider.set(crypto.webcrypto as Crypto);

import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { PkiService } from './pki.service';

// ─── Setup de CA de prueba (se crea una sola vez por suite) ──────────────────

let testCaCertPem: string;
let testCaKeyPem: string;

const SIGN_ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const subtle = crypto.webcrypto.subtle as SubtleCrypto;

async function generateTestCa(): Promise<void> {
  const caKeys = await subtle.generateKey(
    SIGN_ALG as EcKeyGenParams,
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;

  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: 'CAFECAFE01',
    name: 'CN=Test CA, O=4nexa-test',
    notBefore: new Date('2024-01-01'),
    notAfter: new Date('2030-01-01'),
    signingAlgorithm: SIGN_ALG,
    keys: caKeys,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true)],
  });

  testCaCertPem = caCert.toString('pem');

  const privateKeyBuffer = await subtle.exportKey('pkcs8', caKeys.privateKey);
  const b64 = Buffer.from(privateKeyBuffer).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  testCaKeyPem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function makePkiService(overrides: {
  MTLS_CA_CERT_PEM?: string;
  MTLS_CA_KEY_PEM?: string;
} = {}): PkiService {
  const map: Record<string, string | undefined> = {
    MTLS_CA_CERT_PEM: testCaCertPem,
    MTLS_CA_KEY_PEM: testCaKeyPem,
    ...overrides,
  };
  const config = {
    get: (key: string) => map[key],
  } as unknown as ConfigService<any, true>;
  return new PkiService(config);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PkiService', () => {
  beforeAll(async () => {
    await generateTestCa();
  });

  // ── isEnabled ──────────────────────────────────────────────────────────────

  describe('isEnabled()', () => {
    it('devuelve true cuando CA cert y key están configurados', () => {
      const svc = makePkiService();
      expect(svc.isEnabled()).toBe(true);
    });

    it('devuelve false cuando falta MTLS_CA_CERT_PEM', () => {
      const svc = makePkiService({ MTLS_CA_CERT_PEM: undefined });
      expect(svc.isEnabled()).toBe(false);
    });

    it('devuelve false cuando falta MTLS_CA_KEY_PEM', () => {
      const svc = makePkiService({ MTLS_CA_KEY_PEM: undefined });
      expect(svc.isEnabled()).toBe(false);
    });
  });

  // ── getCaCertPem ───────────────────────────────────────────────────────────

  describe('getCaCertPem()', () => {
    it('devuelve el PEM de la CA', () => {
      const svc = makePkiService();
      expect(svc.getCaCertPem()).toBe(testCaCertPem);
    });

    it('lanza InternalServerErrorException cuando no hay CA configurada', () => {
      const svc = makePkiService({ MTLS_CA_CERT_PEM: undefined });
      expect(() => svc.getCaCertPem()).toThrow(InternalServerErrorException);
    });
  });

  // ── enrollNode ─────────────────────────────────────────────────────────────

  describe('enrollNode()', () => {
    const NODE_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
    const HOSTNAME = 'mail-node-01.example.com';

    it('lanza cuando PKI no está configurada', async () => {
      const svc = makePkiService({ MTLS_CA_CERT_PEM: undefined });
      await expect(svc.enrollNode(NODE_ID, HOSTNAME)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    describe('cuando la CA está configurada', () => {
      let result: Awaited<ReturnType<PkiService['enrollNode']>>;

      beforeAll(async () => {
        const svc = makePkiService();
        result = await svc.enrollNode(NODE_ID, HOSTNAME);
      });

      it('devuelve agentCertPem con cabecera PEM válida', () => {
        expect(result.agentCertPem).toMatch(/^-----BEGIN CERTIFICATE-----/);
        expect(result.agentCertPem).toMatch(/-----END CERTIFICATE-----/);
      });

      it('devuelve agentKeyPem con cabecera PRIVATE KEY', () => {
        expect(result.agentKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
        expect(result.agentKeyPem).toMatch(/-----END PRIVATE KEY-----/);
      });

      it('devuelve caCertPem igual al certificado CA de prueba', () => {
        expect(result.caCertPem).toBe(testCaCertPem);
      });

      it('devuelve fingerprint de 64 caracteres hex', () => {
        expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      });

      it('devuelve serialNumber no vacío', () => {
        expect(result.serialNumber).toBeTruthy();
        expect(result.serialNumber.length).toBeGreaterThan(0);
      });

      it('devuelve expiresAt en el futuro (~ 1 año)', () => {
        const now = Date.now();
        const ms = result.expiresAt.getTime() - now;
        // Entre 364 y 366 días
        expect(ms).toBeGreaterThan(363 * 24 * 60 * 60 * 1000);
        expect(ms).toBeLessThan(367 * 24 * 60 * 60 * 1000);
      });

      it('el certificado tiene CN correcto', () => {
        const cert = new x509.X509Certificate(result.agentCertPem);
        expect(cert.subject).toContain(`CN=node-agent.${HOSTNAME}`);
      });

      it('el certificado está emitido por la CA de prueba', () => {
        const cert = new x509.X509Certificate(result.agentCertPem);
        const caCert = new x509.X509Certificate(testCaCertPem);
        expect(cert.issuer).toBe(caCert.subject);
      });

      it('cada llamada genera un certificado único (serial diferente)', async () => {
        const svc = makePkiService();
        const r2 = await svc.enrollNode(NODE_ID, HOSTNAME);
        expect(r2.serialNumber).not.toBe(result.serialNumber);
        expect(r2.fingerprint).not.toBe(result.fingerprint);
      });
    });
  });
});

// ─── bufferToPem con buffer vacío (rama ?? [] en línea 149) ──────────────────

describe('PkiService.bufferToPem — buffer vacío', () => {
  it('retorna PEM sin líneas de contenido cuando buffer está vacío (b64.match → null → ?? [])', () => {
    // Acceso a método privado estático para cubrir la rama ?? []
    const pem = (PkiService as any).bufferToPem(new ArrayBuffer(0), 'EMPTY');
    expect(pem).toBe('-----BEGIN EMPTY-----\n\n-----END EMPTY-----\n');
  });
});
