import { z } from 'zod';

export const EnvSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('api/v1'),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',')),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // DKIM
  DKIM_ENCRYPTION_KEY: z.string().min(32),

  // Node Agent mTLS
  NODE_AGENT_MTLS_CERT: z.string().optional(),
  NODE_AGENT_MTLS_KEY: z.string().optional(),
  NODE_AGENT_MTLS_CA: z.string().optional(),

  // CA interna para emitir certificados mTLS a los nodos (§17.3)
  // Si no están configuradas, el enrolamiento mTLS está desactivado.
  MTLS_CA_CERT_PEM: z.string().optional(),
  MTLS_CA_KEY_PEM: z.string().optional(),

  // Node Agent JWT (secreto compartido para firmar tokens enviados al agente)
  NODE_AGENT_JWT_SECRET: z.string().min(32),
  NODE_AGENT_JWT_EXPIRES_IN: z.string().default('5m'),

  // Node Agent URL base (ej: http://localhost:3099/agent en dev)
  NODE_AGENT_BASE_URL: z.string().url().default('http://localhost:3099/agent'),

  // Throttle
  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Audit HMAC (§29.3) — secreto para la cadena de integridad de audit logs
  // CRÍTICO: sobreescribir en producción con un valor aleatorio de >= 32 caracteres.
  AUDIT_HMAC_SECRET: z.string().min(32).default('CHANGE_ME_audit_hmac_secret_00000'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
