import { z } from 'zod';

export const CreatePlanSchema = z.object({
  name: z.string().min(2).max(100),
  maxDomains: z.number().int().positive(),
  maxMailboxes: z.number().int().positive(),
  storageTotalBytes: z.number().int().positive(),
  storagePerMailboxBytes: z.number().int().positive(),
  outboundDailyLimit: z.number().int().nonnegative(),
  antivirusEnabled: z.boolean().default(false),
  backupRetentionDays: z.number().int().min(1).max(365).default(7),
  priceMonthly: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio mensual inválido'),
  priceYearly: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Precio anual inválido'),
  active: z.boolean().default(true),
});

export const UpdatePlanSchema = CreatePlanSchema.partial();

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
