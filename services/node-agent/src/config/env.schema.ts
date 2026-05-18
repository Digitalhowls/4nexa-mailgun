import { z } from 'zod';

export const AgentEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AGENT_PORT: z.coerce.number().int().positive().default(3099),
  AGENT_HOST: z.string().default('0.0.0.0'),

  // ID del nodo que este agente representa
  AGENT_NODE_ID: z.string().uuid(),

  // Secreto compartido con el Control Plane para validar JWT
  AGENT_JWT_SECRET: z.string().min(32),

  // ─── Modo de operación ─────────────────────────────────────────────────
  // 'mock'   → MockOperationsService (sin infra real, para desarrollo sin Docker)
  // 'docker' → MailNodeOperationsService con docker exec
  // 'native' → MailNodeOperationsService con comandos directos (bare metal)
  AGENT_MODE: z.enum(['mock', 'docker', 'native']).default('mock'),

  // ─── Paths de configuración (requeridos en modo docker/native) ────────
  AGENT_POSTFIX_VIRTUAL_DIR: z.string().default('/var/config/postfix/virtual'),
  AGENT_DOVECOT_USERS_FILE: z.string().default('/var/config/dovecot/users.conf'),
  AGENT_RSPAMD_DKIM_DIR: z.string().default('/var/config/rspamd/dkim'),

  // ─── Contenedores Docker (requeridos en modo docker) ──────────────────
  AGENT_DOCKER_POSTFIX_CONTAINER: z.string().default('mailnode-postfix'),
  AGENT_DOCKER_DOVECOT_CONTAINER: z.string().default('mailnode-dovecot'),
  AGENT_DOCKER_RSPAMD_CONTAINER: z.string().default('mailnode-rspamd'),

  // ─── DKIM (requerido en modo docker/native) ───────────────────────────
  // Debe ser idéntica a DKIM_ENCRYPTION_KEY del Control Plane
  AGENT_DKIM_ENCRYPTION_KEY: z.string().min(16).default('change-me-32-char-minimum-key!!'),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type AgentEnvConfig = z.infer<typeof AgentEnvSchema>;
