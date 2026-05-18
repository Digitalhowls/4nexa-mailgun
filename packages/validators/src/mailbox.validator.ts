import { z } from 'zod';
import { MailboxStatus } from '@4nexa/types';

const LOCAL_PART_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

const PASSWORD_SCHEMA = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial');

export const CreateMailboxSchema = z.object({
  tenantId: z.string().uuid(),
  domainId: z.string().uuid(),
  localPart: z
    .string()
    .min(1, 'La parte local del email es obligatoria')
    .max(64, 'La parte local no puede superar 64 caracteres')
    .regex(LOCAL_PART_REGEX, 'La parte local contiene caracteres no permitidos')
    .transform((lp) => lp.toLowerCase()),
  password: PASSWORD_SCHEMA,
  quotaBytes: z
    .number()
    .int()
    .positive()
    .max(107_374_182_400) // 100 GB max
    .optional(),
  forcePasswordReset: z.boolean().optional().default(false),
});

export const UpdateMailboxSchema = z.object({
  quotaBytes: z.number().int().positive().max(107_374_182_400).optional(),
  status: z.nativeEnum(MailboxStatus).optional(),
  forcePasswordReset: z.boolean().optional(),
});

export const ResetMailboxPasswordSchema = z.object({
  newPassword: PASSWORD_SCHEMA,
  forcePasswordReset: z.boolean().optional().default(false),
});

export const MailboxFilterSchema = z.object({
  tenantId: z.string().uuid().optional(),
  domainId: z.string().uuid().optional(),
  status: z.nativeEnum(MailboxStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateMailboxInput = z.infer<typeof CreateMailboxSchema>;
export type UpdateMailboxInput = z.infer<typeof UpdateMailboxSchema>;
export type ResetMailboxPasswordInput = z.infer<typeof ResetMailboxPasswordSchema>;
export type MailboxFilterInput = z.infer<typeof MailboxFilterSchema>;
