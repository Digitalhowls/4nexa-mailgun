import { z } from 'zod';

/** Cuerpo para iniciar la rotación de claves DKIM de un dominio (§23) */
export const RotateDkimSchema = z.object({
  /** Selector DKIM nuevo. Si se omite, se autogenera como "4nexa-<timestamp>" */
  newSelector: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i, 'Selector DKIM inválido')
    .optional(),
});

export type RotateDkimInput = z.infer<typeof RotateDkimSchema>;
