import type { DomainConfigData, RspamdParams } from '../types';

// ── Valores por defecto (paper §34.3) ─────────────────────────────────────────

/** Puntuación mínima para marcar como SPAM en cabeceras */
const DEFAULT_SPAM_THRESHOLD = 5.0;

/**
 * Puntuación mínima para rechazar el mensaje directamente en SMTP.
 * Se establece alto para preferir cuarentena sobre rechazo.
 */
const DEFAULT_REJECT_THRESHOLD = 15.0;

/**
 * Construye los parámetros de configuración para Rspamd.
 *
 * Rspamd actúa como milter entre Postfix y la entrega final:
 * - Valida firma DKIM en mensajes entrantes
 * - Firma DKIM en mensajes salientes (usando la clave privada del dominio)
 * - Consulta DNSBL para IPs sospechosas
 * - Aplica filtros Bayesianos
 * - Gestiona cuarentena
 *
 * @param domains Dominios ACTIVE del nodo con DKIM configurado
 */
export function buildRspamdParams(domains: DomainConfigData[]): RspamdParams {
  // Solo dominios ACTIVE con clave privada DKIM disponible
  const dkimDomains = domains
    .filter((d) => d.status === 'ACTIVE' && d.dkimPrivateKeyEncrypted !== null)
    .map((d) => ({
      domain: d.domain,
      selector: d.dkimSelector,
      // Clave privada cifrada — el agente la descifra con DKIM_ENCRYPTION_KEY
      privateKeyEncrypted: d.dkimPrivateKeyEncrypted as string,
    }));

  return {
    dkimDomains,
    dnsblEnabled: true,
    spamThreshold: DEFAULT_SPAM_THRESHOLD,
    rejectThreshold: DEFAULT_REJECT_THRESHOLD,
  };
}
