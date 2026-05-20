import { z } from 'zod';

// ─── Constantes ────────────────────────────────────────────────────────────────

export const MIGRATION_PROVIDERS = [
  'GOOGLE_WORKSPACE',
  'MICROSOFT_365',
  'CPANEL',
  'PLESK',
  'ZIMBRA',
  'GENERIC_IMAP',
] as const;

export const MIGRATION_STATUSES = [
  'PENDING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

// ─── CreateMigrationJob ────────────────────────────────────────────────────────

export const CreateMigrationJobSchema = z.object({
  tenantId: z.string().uuid(),
  /** Buzón destino concreto; null migra todos los buzones del tenant */
  mailboxId: z.string().uuid().optional(),
  provider: z.enum(MIGRATION_PROVIDERS),
  sourceHost: z.string().min(1).max(255),
  sourcePort: z.coerce.number().int().min(1).max(65535).default(993),
  sourceUsername: z.string().min(1).max(255),
  /** Contraseña en texto plano que el servicio cifra antes de persistir */
  sourcePassword: z.string().min(1).max(500),
  sourceTls: z.boolean().default(true),
});

export type CreateMigrationJobDto = z.infer<typeof CreateMigrationJobSchema>;

// ─── ListMigrationJobs ─────────────────────────────────────────────────────────

export const ListMigrationJobsSchema = z.object({
  tenantId: z.string().uuid().optional(),
  provider: z.enum(MIGRATION_PROVIDERS).optional(),
  status: z.enum(MIGRATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListMigrationJobsDto = z.infer<typeof ListMigrationJobsSchema>;
