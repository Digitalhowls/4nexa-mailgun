import { z } from 'zod';
import type { NodeConfigBundle, ConfigValidationResult, PostfixParams, DovecotParams, RspamdParams } from '../types';

// ─── Schemas de validación estática ───────────────────────────────────────────

const DomainSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  domain: z.string().min(4).max(253).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'FQDN inválido'),
  dkimSelector: z.string().min(1).max(63),
  dkimPublicKey: z.string().nullable(),
  dkimPrivateKeyEncrypted: z.string().nullable(),
  status: z.string(),
});

const MailboxSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  domainId: z.string().uuid(),
  localPart: z.string().min(1).max(64),
  domain: z.string().min(4).max(253),
  passwordHash: z.string().min(20),
  status: z.string(),
  quotaBytes: z.bigint().positive(),
});

const AliasSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  source: z.string().email(),
  destination: z.string().email(),
  active: z.boolean(),
});

const NodeConfigBundleSchema = z.object({
  nodeId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  domains: z.array(DomainSchema),
  mailboxes: z.array(MailboxSchema),
  aliases: z.array(AliasSchema),
});

// ─── Schemas de parámetros de servicio ────────────────────────────────────────

export const PostfixParamsSchema = z.object({
  virtualDomains: z.array(z.string().min(4)),
  virtualMailboxes: z.array(
    z.object({
      address: z.string().email(),
      maildir: z.string().min(1),
    }),
  ),
  virtualAliases: z.array(
    z.object({
      source: z.string().email(),
      destination: z.string().email(),
    }),
  ),
  dkimEntries: z.array(
    z.object({
      domain: z.string().min(4),
      selector: z.string().min(1),
      privateKeyEncrypted: z.string().min(20),
    }),
  ),
  smtpdClientMessageRateLimit: z.number().int().positive().max(10000),
  smtpdClientRecipientRateLimit: z.number().int().positive().max(10000),
});

export const DovecotParamsSchema = z.object({
  users: z.array(
    z.object({
      username: z.string().email(),
      passwordHash: z.string().startsWith('{ARGON2ID}'),
      quotaBytes: z.string().regex(/^\d+$/, 'quotaBytes debe ser número como string'),
      homeDir: z.string().startsWith('/var/mail/'),
    }),
  ),
});

export const RspamdParamsSchema = z.object({
  dkimDomains: z.array(
    z.object({
      domain: z.string().min(4),
      selector: z.string().min(1),
      privateKeyEncrypted: z.string().min(20),
    }),
  ),
  dnsblEnabled: z.boolean(),
  spamThreshold: z.number().min(0).max(20),
  rejectThreshold: z.number().min(0).max(100),
});

// ─── Función de validación del bundle completo ────────────────────────────────

/**
 * Valida estáticamente un NodeConfigBundle antes de enviarlo al agente.
 *
 * Comprueba:
 * 1. Estructura y tipos correctos (Zod schema)
 * 2. Coherencia de datos (cada mailbox tiene un dominio en el bundle)
 * 3. Duplicados de dirección email
 * 4. Dominios sin DKIM (warning, no error)
 */
export function validateNodeConfigBundle(bundle: NodeConfigBundle): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validación estructural con Zod
  const result = NodeConfigBundleSchema.safeParse(bundle);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`[${issue.path.join('.')}] ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  // 2. Coherencia: cada mailbox debe tener su dominio en el bundle
  const domainIds = new Set(bundle.domains.map((d) => d.id));
  for (const mailbox of bundle.mailboxes) {
    if (!domainIds.has(mailbox.domainId)) {
      errors.push(
        `Buzón "${mailbox.localPart}@${mailbox.domain}" referencia domainId "${mailbox.domainId}" no presente en el bundle`,
      );
    }
  }

  // 3. Cada alias debe tener su dominio en el bundle (a través del dominio del source)
  const domainNames = new Set(bundle.domains.map((d) => d.domain));
  for (const alias of bundle.aliases) {
    const sourceDomain = alias.source.split('@')[1];
    if (sourceDomain && !domainNames.has(sourceDomain)) {
      errors.push(
        `Alias "${alias.source}" → "${alias.destination}": dominio origen "${sourceDomain}" no presente en el bundle`,
      );
    }
  }

  // 4. Duplicados de dirección email en mailboxes
  const addresses = bundle.mailboxes.map((m) => `${m.localPart}@${m.domain}`);
  const seen = new Set<string>();
  for (const addr of addresses) {
    if (seen.has(addr)) {
      errors.push(`Dirección de email duplicada en el bundle: "${addr}"`);
    }
    seen.add(addr);
  }

  // 5. Warnings: dominios ACTIVE sin DKIM configurado
  for (const domain of bundle.domains) {
    if (domain.status === 'ACTIVE' && !domain.dkimPrivateKeyEncrypted) {
      warnings.push(
        `Dominio "${domain.domain}" está ACTIVE pero no tiene clave DKIM configurada — no se firmará con DKIM`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valida los parámetros construidos para Postfix antes de enviarlos al agente.
 */
export function validatePostfixParams(params: PostfixParams): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = PostfixParamsSchema.safeParse(params);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`[postfix.${issue.path.join('.')}] ${issue.message}`);
    }
  }

  if (params.virtualDomains.length === 0) {
    warnings.push('No hay dominios virtuales configurados en Postfix — el nodo no recibirá correo');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Valida los parámetros construidos para Dovecot antes de enviarlos al agente.
 */
export function validateDovecotParams(params: DovecotParams): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = DovecotParamsSchema.safeParse(params);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`[dovecot.${issue.path.join('.')}] ${issue.message}`);
    }
  }

  if (params.users.length === 0) {
    warnings.push('No hay usuarios configurados en Dovecot — no se podrá autenticar ningún buzón');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Valida los parámetros construidos para Rspamd antes de enviarlos al agente.
 */
export function validateRspamdParams(params: RspamdParams): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = RspamdParamsSchema.safeParse(params);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`[rspamd.${issue.path.join('.')}] ${issue.message}`);
    }
  }

  if (params.rejectThreshold <= params.spamThreshold) {
    errors.push(
      `rejectThreshold (${params.rejectThreshold}) debe ser mayor que spamThreshold (${params.spamThreshold})`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
