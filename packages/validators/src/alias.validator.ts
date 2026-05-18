import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CreateAliasSchema = z.object({
  tenantId: z.string().uuid(),
  domainId: z.string().uuid(),
  source: z
    .string()
    .min(1)
    .max(254)
    .regex(EMAIL_REGEX, 'El alias de origen no es un email válido')
    .transform((e) => e.toLowerCase()),
  destination: z
    .string()
    .min(1)
    .max(254)
    .regex(EMAIL_REGEX, 'El destino no es un email válido')
    .transform((e) => e.toLowerCase()),
  active: z.boolean().optional().default(true),
});

export const UpdateAliasSchema = z.object({
  destination: z
    .string()
    .min(1)
    .max(254)
    .regex(EMAIL_REGEX)
    .transform((e) => e.toLowerCase())
    .optional(),
  active: z.boolean().optional(),
});

export const AliasFilterSchema = z.object({
  tenantId: z.string().uuid().optional(),
  domainId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAliasInput = z.infer<typeof CreateAliasSchema>;
export type UpdateAliasInput = z.infer<typeof UpdateAliasSchema>;
export type AliasFilterInput = z.infer<typeof AliasFilterSchema>;
