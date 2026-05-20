import { z } from 'zod';

/** Crear o actualizar política antispam de un dominio (§27) */
export const UpsertAntispamPolicySchema = z.object({
  enabled: z.boolean().default(true),
  /** 0.0–1.0. Puntuación ≥ spamThreshold → FLAG (etiquetar sin rechazar). Default 0.80 */
  spamThreshold: z.number().min(0).max(1).default(0.80),
  /** 0.0–1.0. Puntuación ≥ rejectAbove → REJECT. Debe ser ≥ spamThreshold. Default 0.95 */
  rejectAbove: z.number().min(0).max(1).default(0.95),
  greylistEnabled: z.boolean().default(false),
  /** Lista de emails o dominios siempre permitidos */
  whitelist: z.array(z.string().max(255)).max(500).default([]),
  /** Lista de emails o dominios siempre bloqueados */
  blacklist: z.array(z.string().max(255)).max(500).default([]),
}).refine(
  (data) => data.rejectAbove >= data.spamThreshold,
  { message: 'rejectAbove debe ser mayor o igual a spamThreshold', path: ['rejectAbove'] },
);

export type UpsertAntispamPolicyInput = z.infer<typeof UpsertAntispamPolicySchema>;

/** Evaluar un mensaje entrante contra la política del dominio (§27) */
export const EvaluateMessageSchema = z.object({
  /** Email del remitente */
  senderEmail: z.string().email(),
  /** Puntuación de spam pre-calculada (0.0–1.0). Si se omite se aplica sólo whitelist/blacklist */
  spamScore: z.number().min(0).max(1).optional(),
});

export type EvaluateMessageInput = z.infer<typeof EvaluateMessageSchema>;
