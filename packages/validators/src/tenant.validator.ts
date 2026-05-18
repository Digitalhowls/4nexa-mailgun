import { z } from 'zod';
import { TenantStatus } from '@4nexa/types';

export const CreateTenantSchema = z.object({
  name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar 100 caracteres'),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      'El slug solo puede contener letras minúsculas, números y guiones',
    )
    .optional(),
  legalName: z.string().max(200).optional().nullable(),
  billingEmail: z
    .string()
    .email('Email de facturación inválido')
    .max(254),
  planId: z.string().uuid('planId debe ser un UUID válido').optional().nullable(),
  nodeId: z.string().uuid('nodeId debe ser un UUID válido').optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  legalName: z.string().max(200).optional().nullable(),
  billingEmail: z.string().email().max(254).optional(),
  planId: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const SuspendTenantSchema = z.object({
  reason: z.string().min(5).max(500).optional(),
});

export const AssignNodeSchema = z.object({
  nodeId: z.string().uuid('nodeId debe ser un UUID válido'),
});

export const TenantFilterSchema = z.object({
  status: z.nativeEnum(TenantStatus).optional(),
  planId: z.string().uuid().optional(),
  nodeId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type SuspendTenantInput = z.infer<typeof SuspendTenantSchema>;
export type AssignNodeInput = z.infer<typeof AssignNodeSchema>;
export type TenantFilterInput = z.infer<typeof TenantFilterSchema>;
