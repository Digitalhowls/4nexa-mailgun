import { z } from 'zod';
import { NodeStatus } from '@4nexa/types';

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export const CreateNodeSchema = z.object({
  hostname: z
    .string()
    .min(4)
    .max(253)
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Hostname inválido',
    ),
  ipV4: z.string().regex(IPV4_REGEX, 'IPv4 inválida'),
  ipV6: z.string().max(45).optional().nullable(),
  provider: z.string().min(2).max(100),
  region: z.string().min(2).max(100),
  maxTenants: z.number().int().positive().default(50),
});

export const UpdateNodeSchema = z.object({
  status: z.nativeEnum(NodeStatus).optional(),
  maxTenants: z.number().int().positive().optional(),
  reputationScore: z.number().int().min(0).max(100).optional(),
  capacityScore: z.number().int().min(0).max(100).optional(),
});

export const NodeFilterSchema = z.object({
  status: z.nativeEnum(NodeStatus).optional(),
  provider: z.string().optional(),
  region: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const SetMaintenanceSchema = z.object({
  maintenance: z.boolean(),
});

export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;
export type NodeFilterInput = z.infer<typeof NodeFilterSchema>;
export type SetMaintenanceInput = z.infer<typeof SetMaintenanceSchema>;
