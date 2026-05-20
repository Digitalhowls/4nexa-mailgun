import { z } from 'zod';
import { BackupType, BackupStatus } from '@4nexa/types';

// ─── TriggerBackup ────────────────────────────────────────────────────────────

export const TriggerBackupSchema = z.object({
  nodeId: z.string().uuid('nodeId debe ser un UUID válido'),
  type: z.nativeEnum(BackupType).default(BackupType.FULL_NODE),
  targetPath: z.string().max(512).optional(),
  tenantId: z.string().uuid().optional(),
});

export type TriggerBackupInput = z.infer<typeof TriggerBackupSchema>;

// ─── BackupFilter ─────────────────────────────────────────────────────────────

export const BackupFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
  status: z.nativeEnum(BackupStatus).optional(),
  type: z.nativeEnum(BackupType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type BackupFilterInput = z.infer<typeof BackupFilterSchema>;
