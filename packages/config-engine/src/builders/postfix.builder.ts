import type { DomainConfigData, MailboxConfigData, AliasConfigData, PostfixParams } from '../types';

// ── Constantes de rate limiting (configurables por defecto, paper §34.1) ──────

/** Mensajes por segundo por cliente SMTP (smtpd_client_message_rate_limit) */
const DEFAULT_MESSAGE_RATE_LIMIT = 100;
/** Destinatarios por segunda por cliente SMTP */
const DEFAULT_RECIPIENT_RATE_LIMIT = 200;

/**
 * Construye los parámetros de configuración para Postfix.
 *
 * Postfix usa virtual hosting con:
 * - virtual_mailbox_domains  → lista de dominios alojados
 * - virtual_mailbox_maps     → user@domain → maildir path
 * - virtual_alias_maps       → alias expansions
 * - milter (OpenDKIM/Rspamd) → firma DKIM por dominio
 *
 * El node agent recibe estos parámetros y los renderiza en los archivos
 * de configuración correspondientes en disco.
 *
 * @param domains  Dominios ACTIVE del nodo con DKIM configurado
 * @param mailboxes Buzones ACTIVE del nodo
 * @param aliases  Alias activos del nodo
 */
export function buildPostfixParams(
  domains: DomainConfigData[],
  mailboxes: MailboxConfigData[],
  aliases: AliasConfigData[],
): PostfixParams {
  // ── virtual_mailbox_domains: sólo dominios ACTIVE ─────────────────────────
  const virtualDomains = domains
    .filter((d) => d.status === 'ACTIVE')
    .map((d) => d.domain);

  // ── virtual_mailbox_maps ───────────────────────────────────────────────────
  // Formato: user@domain  domain/user/Maildir/
  // Postfix usa esta ruta como directorio base para el agente de entrega virtual.
  const virtualMailboxes = mailboxes
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      address: `${m.localPart}@${m.domain}`,
      // Ruta relativa dentro de /var/mail (el agente prepende el virtual_mailbox_base)
      maildir: `${m.domain}/${m.localPart}/Maildir/`,
    }));

  // ── virtual_alias_maps ────────────────────────────────────────────────────
  const virtualAliases = aliases
    .filter((a) => a.active)
    .map((a) => ({
      source: a.source,
      destination: a.destination,
    }));

  // ── DKIM signing: sólo dominios con clave privada configurada ─────────────
  const dkimEntries = domains
    .filter((d) => d.status === 'ACTIVE' && d.dkimPrivateKeyEncrypted !== null)
    .map((d) => ({
      domain: d.domain,
      selector: d.dkimSelector,
      // La clave viaja cifrada; el agente la descifra con su DKIM_ENCRYPTION_KEY
      privateKeyEncrypted: d.dkimPrivateKeyEncrypted as string,
    }));

  return {
    virtualDomains,
    virtualMailboxes,
    virtualAliases,
    dkimEntries,
    smtpdClientMessageRateLimit: DEFAULT_MESSAGE_RATE_LIMIT,
    smtpdClientRecipientRateLimit: DEFAULT_RECIPIENT_RATE_LIMIT,
  };
}
