import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as x509 from '@peculiar/x509';
import * as crypto from 'node:crypto';
import type { EnvConfig } from '../config/env.schema';

// Registrar el proveedor WebCrypto nativo de Node.js 18+ para @peculiar/x509
x509.cryptoProvider.set(crypto.webcrypto as Crypto);

// Alias cómodo para operaciones manuales de subtle
const subtle = crypto.webcrypto.subtle as SubtleCrypto;

// ─── Algoritmo ECDSA P-256 ────────────────────────────────────────────────────
const SIGN_ALG: EcKeyGenParams & EcdsaParams = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256',
};

// Validez de certificados de nodo: 1 año
const CERT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

export interface NodeEnrollmentResult {
  /** PEM del certificado de servidor para el agente */
  agentCertPem: string;
  /** PEM de la clave privada del agente (solo se devuelve una vez) */
  agentKeyPem: string;
  /** PEM del certificado de la CA raíz (para que el agente verifique el cliente CP) */
  caCertPem: string;
  /** Huella SHA-256 hex del certificado emitido */
  fingerprint: string;
  /** Número de serie del certificado (hex) */
  serialNumber: string;
  /** Fecha de expiración */
  expiresAt: Date;
}

@Injectable()
export class PkiService {
  private readonly caCertPem: string | undefined;
  private readonly caKeyPem: string | undefined;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.caCertPem = this.config.get('MTLS_CA_CERT_PEM');
    this.caKeyPem = this.config.get('MTLS_CA_KEY_PEM');
  }

  /** Indica si la CA está configurada y el enrolamiento mTLS está disponible. */
  isEnabled(): boolean {
    return Boolean(this.caCertPem && this.caKeyPem);
  }

  /** PEM del certificado de la CA raíz (para distribuir al agente). */
  getCaCertPem(): string {
    if (!this.caCertPem) {
      throw new InternalServerErrorException(
        'La CA mTLS no está configurada (MTLS_CA_CERT_PEM)',
      );
    }
    return this.caCertPem;
  }

  /**
   * Genera un par de claves ECDSA P-256 y emite un certificado de servidor
   * firmado por la CA interna para el nodo indicado.
   *
   * El CN del certificado es: `node-agent.<hostname>`
   * Este certificado identifica al agente ante el Control Plane en mTLS.
   */
  async enrollNode(
    nodeId: string,
    hostname: string,
  ): Promise<NodeEnrollmentResult> {
    if (!this.caCertPem || !this.caKeyPem) {
      throw new InternalServerErrorException(
        'La CA mTLS no está configurada. Configure MTLS_CA_CERT_PEM y MTLS_CA_KEY_PEM.',
      );
    }

    // Cargar la CA
    const caCert = new x509.X509Certificate(this.caCertPem);
    const caKeyRaw = PkiService.pemToBuffer(this.caKeyPem, 'PRIVATE KEY');
    const caSignKey = await subtle.importKey('pkcs8', caKeyRaw, SIGN_ALG, false, ['sign']);

    // Generar par de claves para el nodo
    const nodeKeys = await subtle.generateKey(SIGN_ALG, true, ['sign', 'verify']);
    const nodePublicKey = (nodeKeys as CryptoKeyPair).publicKey;
    const nodePrivateKey = (nodeKeys as CryptoKeyPair).privateKey;

    // Número de serie aleatorio (16 bytes hex)
    const serialNumber = crypto.randomBytes(16).toString('hex').toUpperCase();

    const notBefore = new Date();
    const notAfter = new Date(Date.now() + CERT_VALIDITY_MS);

    // Emitir certificado de servidor del agente
    const agentCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=node-agent.${hostname}, O=4nexa, OU=mail-node, SN=${nodeId}`,
      issuer: caCert.subject,
      notBefore,
      notAfter,
      signingKey: caSignKey,
      signingAlgorithm: SIGN_ALG,
      publicKey: nodePublicKey,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.ExtendedKeyUsageExtension(
          [x509.ExtendedKeyUsage.serverAuth],
          false,
        ),
        await x509.SubjectKeyIdentifierExtension.create(nodePublicKey),
        await x509.AuthorityKeyIdentifierExtension.create(caCert.publicKey),
      ],
    });

    const agentCertPem = agentCert.toString('pem');

    // Exportar clave privada del nodo en PKCS#8 PEM
    const privateKeyBuffer = await subtle.exportKey('pkcs8', nodePrivateKey);
    const agentKeyPem = PkiService.bufferToPem(privateKeyBuffer, 'PRIVATE KEY');

    // Huella SHA-256 del certificado
    const fingerprint = await PkiService.certFingerprint(agentCert);

    return {
      agentCertPem,
      agentKeyPem,
      caCertPem: this.caCertPem,
      fingerprint,
      serialNumber,
      expiresAt: notAfter,
    };
  }

  // ─── Helpers privados ────────────────────────────────────────────────────

  private static pemToBuffer(pem: string, label: string): ArrayBuffer {
    const b64 = pem
      .replace(new RegExp(`-----BEGIN ${label}-----`, 'g'), '')
      .replace(new RegExp(`-----END ${label}-----`, 'g'), '')
      .replace(/\s+/g, '');
    const binary = Buffer.from(b64, 'base64');
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }

  private static bufferToPem(buffer: ArrayBuffer, label: string): string {
    const b64 = Buffer.from(buffer).toString('base64');
    const lines = b64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
  }

  private static async certFingerprint(cert: x509.X509Certificate): Promise<string> {
    const raw = cert.rawData;
    const hash = await subtle.digest('SHA-256', raw);
    return Buffer.from(hash).toString('hex');
  }
}
