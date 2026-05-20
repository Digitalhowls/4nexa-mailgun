import { z } from 'zod';

// ─── NodeAutoAssignInput ─────────────────────────────────────────────────────

/**
 * Parámetros para asignar un tenant o dominio a un nodo.
 * nodeId es opcional: si se omite, el engine selecciona el mejor nodo automáticamente.
 */
export const NodeAutoAssignSchema = z.object({
  nodeId: z.string().uuid().optional(),
  /** Preferencia de región para auto-selección */
  regionPreference: z.string().max(100).optional(),
});

export type NodeAutoAssignInput = z.infer<typeof NodeAutoAssignSchema>;

// ─── DrainNodeInput ──────────────────────────────────────────────────────────

export const DrainNodeSchema = z.object({
  /** Nodo destino preferido para la migración. Si se omite, auto-selecciona por score. */
  targetNodeId: z.string().uuid().optional(),
});

export type DrainNodeInput = z.infer<typeof DrainNodeSchema>;

// ─── QuarantineNodeInput ─────────────────────────────────────────────────────

export const QuarantineNodeSchema = z.object({
  reason: z.string().min(3).max(500),
});

export type QuarantineNodeInput = z.infer<typeof QuarantineNodeSchema>;

// ─── SetWarmupInput ──────────────────────────────────────────────────────────

export const SetWarmupSchema = z.object({
  warmupStatus: z.enum(['COLD', 'WARMING', 'WARM']),
  /** Fecha estimada de fin del warmup (solo relevante cuando warmupStatus = WARMING) */
  warmupEndsAt: z.string().datetime().optional(),
});

export type SetWarmupInput = z.infer<typeof SetWarmupSchema>;

// ─── FindBestNodeQuery ───────────────────────────────────────────────────────

export const FindBestNodeQuerySchema = z.object({
  regionPreference: z.string().max(100).optional(),
  providerPreference: z.string().max(100).optional(),
});

export type FindBestNodeQuery = z.infer<typeof FindBestNodeQuerySchema>;
