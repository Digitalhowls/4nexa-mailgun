import { z } from 'zod';

// ─── AuditQueryInput ──────────────────────────────────────────────────────────

export const AuditQuerySchema = z.object({
  tenantId:   z.string().uuid().optional(),
  action:     z.string().max(100).optional(),
  entityType: z.string().max(50).optional(),
  entityId:   z.string().uuid().optional(),
  startDate:  z.string().datetime().optional(),
  endDate:    z.string().datetime().optional(),
  limit:      z.coerce.number().int().positive().max(200).default(50),
  offset:     z.coerce.number().int().nonnegative().default(0),
});

export type AuditQueryInput = z.infer<typeof AuditQuerySchema>;

// ─── AuditVerifyRangeInput ────────────────────────────────────────────────────

export const AuditVerifyRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate:   z.string().datetime(),
});

export type AuditVerifyRangeInput = z.infer<typeof AuditVerifyRangeSchema>;
