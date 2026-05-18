import { z } from 'zod';
import { DomainStatus } from '@4nexa/types';

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const CreateDomainSchema = z.object({
  tenantId: z.string().uuid(),
  domain: z
    .string()
    .min(4, 'El dominio es demasiado corto')
    .max(253, 'El dominio es demasiado largo')
    .regex(DOMAIN_REGEX, 'El formato del dominio no es válido')
    .transform((d) => d.toLowerCase()),
  nodeId: z.string().uuid().optional().nullable(),
});

export const UpdateDomainSchema = z.object({
  nodeId: z.string().uuid().optional().nullable(),
});

export const DomainFilterSchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: z.nativeEnum(DomainStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateDomainInput = z.infer<typeof CreateDomainSchema>;
export type UpdateDomainInput = z.infer<typeof UpdateDomainSchema>;
export type DomainFilterInput = z.infer<typeof DomainFilterSchema>;
