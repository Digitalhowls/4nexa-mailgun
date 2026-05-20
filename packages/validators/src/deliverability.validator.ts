import { z } from 'zod';

// ─── CheckSendPermissionInput ─────────────────────────────────────────────────

export const CheckSendPermissionSchema = z.object({
  domainId: z.string().uuid(),
  /** Volumen estimado del envío (para validar contra límite warmup) */
  estimatedVolume: z.number().int().positive().optional(),
});

export type CheckSendPermissionInput = z.infer<typeof CheckSendPermissionSchema>;
