// ─── Datos de dominio necesarios para generar configuración (paper §34) ───────

export interface DomainConfigData {
  /** UUID del dominio */
  id: string;
  /** UUID del tenant propietario */
  tenantId: string;
  /** Nombre FQDN del dominio, ej. "empresa.com" */
  domain: string;
  /** Selector DKIM, ej. "4nexa" */
  dkimSelector: string;
  /**
   * Clave pública DKIM en formato base64 (sólo el cuerpo del PEM, sin cabeceras).
   * Se usa para generar el registro DNS TXT.
   */
  dkimPublicKey: string | null;
  /**
   * Clave privada DKIM cifrada con AES-256-GCM (base64).
   * Se envía al nodo agente tal cual; el agente la descifra con su DKIM_ENCRYPTION_KEY local.
   */
  dkimPrivateKeyEncrypted: string | null;
  /** Estado del dominio — sólo se generan configs para dominios ACTIVE */
  status: string;
}

// ─── Datos de buzón necesarios para Dovecot ───────────────────────────────────

export interface MailboxConfigData {
  /** UUID del buzón */
  id: string;
  /** UUID del tenant */
  tenantId: string;
  /** UUID del dominio al que pertenece */
  domainId: string;
  /** Parte local del email, ej. "usuario" */
  localPart: string;
  /** Nombre completo del dominio, ej. "empresa.com" (desnormalizado en join) */
  domain: string;
  /**
   * Hash de contraseña Argon2id — Dovecot lo acepta con el prefijo {ARGON2ID}.
   * Nunca se expone en respuestas HTTP; sólo viaja al nodo agente por canal JWT.
   */
  passwordHash: string;
  /** Estado — sólo ACTIVE se incluye en configs */
  status: string;
  /**
   * Cuota en bytes. Se pasa como BigInt desde Prisma y se convierte a string
   * al serializar para el agente (JSON no admite BigInt).
   */
  quotaBytes: bigint;
}

// ─── Datos de alias para Postfix virtual_alias_maps ───────────────────────────

export interface AliasConfigData {
  /** UUID del alias */
  id: string;
  /** UUID del tenant */
  tenantId: string;
  /** Dirección de origen, ej. "info@empresa.com" */
  source: string;
  /** Dirección de destino, ej. "usuario@empresa.com" */
  destination: string;
  /** true = activo; false = inactivo (campo `active` en schema Prisma) */
  active: boolean;
}

// ─── Bundle completo de un nodo ────────────────────────────────────────────────

export interface NodeConfigBundle {
  nodeId: string;
  generatedAt: string; // ISO 8601
  domains: DomainConfigData[];
  mailboxes: MailboxConfigData[];
  aliases: AliasConfigData[];
}

// ─── Parámetros por servicio ──────────────────────────────────────────────────

/** Parámetros para la configuración de Postfix */
export interface PostfixParams {
  /** Lista de dominios virtuales (virtual_mailbox_domains) */
  virtualDomains: string[];
  /** Entradas de virtual_mailbox_maps: address → maildir path relativo */
  virtualMailboxes: Array<{ address: string; maildir: string }>;
  /** Entradas de virtual_alias_maps: source → destination */
  virtualAliases: Array<{ source: string; destination: string }>;
  /** Configuración DKIM por dominio */
  dkimEntries: Array<{
    domain: string;
    selector: string;
    /** Clave privada AES-256-GCM cifrada (base64) — el agente la descifra */
    privateKeyEncrypted: string;
  }>;
  /** Límite de mensajes por cliente/sesión SMTP (rate limiting) */
  smtpdClientMessageRateLimit: number;
  /** Límite de destinatarios por cliente/sesión SMTP */
  smtpdClientRecipientRateLimit: number;
}

/** Parámetros para la configuración de Dovecot */
export interface DovecotParams {
  /** Entradas de la base de datos de usuarios y contraseñas */
  users: Array<{
    /** Dirección email completa: localPart@domain */
    username: string;
    /** Hash Argon2id con prefijo {ARGON2ID} para Dovecot */
    passwordHash: string;
    /** Cuota en bytes — serializado como string por limitación JSON */
    quotaBytes: string;
    /** Ruta home del usuario en disco: /var/mail/domain/localPart */
    homeDir: string;
  }>;
}

/** Parámetros para la configuración de Rspamd */
export interface RspamdParams {
  /** Configuración DKIM por dominio para firma de salida */
  dkimDomains: Array<{
    domain: string;
    selector: string;
    /** Clave privada AES-256-GCM cifrada (base64) */
    privateKeyEncrypted: string;
  }>;
  /** Activar/desactivar DNSBL */
  dnsblEnabled: boolean;
  /** Puntuación mínima para marcar como spam */
  spamThreshold: number;
  /** Puntuación mínima para rechazar (reject) */
  rejectThreshold: number;
}

// ─── Resultado de apply ───────────────────────────────────────────────────────

export interface ConfigApplyResult {
  nodeId: string;
  success: boolean;
  appliedAt: string;
  /** Secciones de configuración aplicadas */
  appliedSections: string[];
  /** Servicios recargados */
  reloadedServices: string[];
  /** Versión de configuración (correlationId usado en la operación) */
  configVersion: string;
  /** Errores, si los hubo */
  error?: string;
}

// ─── Resultado de validación ──────────────────────────────────────────────────

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Operación apply_config para el nodo agente ──────────────────────────────

export type ServiceName = 'postfix' | 'dovecot' | 'rspamd';

export interface ConfigSection {
  service: ServiceName;
  templateKey: string;
  parameters: Record<string, unknown>;
}

export interface ApplyConfigPayload {
  sections: ConfigSection[];
  reloadServices: ServiceName[];
}

export interface ApplyConfigAgentResult {
  appliedSections: string[];
  reloadedServices: ServiceName[];
  configVersion: string;
}
