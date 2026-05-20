import { z } from 'zod';

// ─── BillingStatusTransitionInput ─────────────────────────────────────────────

const BILLING_STATUSES = ['ACTIVE', 'GRACE', 'RESTRICTED', 'SUSPENDED'] as const;

export const BillingTransitionSchema = z.object({
  newStatus: z.enum(BILLING_STATUSES),
  reason: z.string().min(3).max(500),
});

export type BillingTransitionInput = z.infer<typeof BillingTransitionSchema>;
