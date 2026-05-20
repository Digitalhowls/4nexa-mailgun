import { z } from 'zod';

// ─── Scopes del Brain (§14) ───────────────────────────────────────────────────

export const BRAIN_SCOPES = [
  'REPUTATION',
  'DELIVERABILITY',
  'SUPPORT',
  'ABUSE',
  'RECOVERY',
  'MIGRATION',
  'OPERATIONAL',
] as const;

export type BrainScope = (typeof BRAIN_SCOPES)[number];

// ─── UpsertMemoryCellInput ────────────────────────────────────────────────────

export const UpsertMemoryCellSchema = z.object({
  tenantId:  z.string().uuid().optional(),
  scope:     z.enum(BRAIN_SCOPES),
  key:       z.string().min(1).max(200),
  payload:   z.record(z.unknown()),
  expiresAt: z.string().datetime().optional(),
});

export type UpsertMemoryCellInput = z.infer<typeof UpsertMemoryCellSchema>;

// ─── QueryMemoryCellsInput ────────────────────────────────────────────────────

export const QueryMemoryCellsSchema = z.object({
  tenantId:        z.string().uuid().optional(),
  scope:           z.enum(BRAIN_SCOPES).optional(),
  keyPrefix:       z.string().max(200).optional(),
  includeExpired:  z.coerce.boolean().default(false),
  limit:           z.coerce.number().int().positive().max(200).default(50),
  offset:          z.coerce.number().int().nonnegative().default(0),
});

export type QueryMemoryCellsInput = z.infer<typeof QueryMemoryCellsSchema>;

// ─── DeleteMemoryCellInput ────────────────────────────────────────────────────

export const DeleteMemoryCellSchema = z.object({
  tenantId: z.string().uuid().optional(),
  scope:    z.enum(BRAIN_SCOPES),
  key:      z.string().min(1).max(200),
});

export type DeleteMemoryCellInput = z.infer<typeof DeleteMemoryCellSchema>;
