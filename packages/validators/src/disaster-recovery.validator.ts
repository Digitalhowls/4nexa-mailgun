import { z } from 'zod';

/** Escenarios de disaster recovery soportados (§25) */
export const DR_SCENARIOS = [
  'node_loss',
  'postgres_corruption',
  'certificate_loss',
  'full_cluster_loss',
] as const;

export type DrScenario = typeof DR_SCENARIOS[number];

export const SimulateDrSchema = z.object({
  scenario:  z.enum(DR_SCENARIOS),
  /** ID del nodo afectado (requerido para node_loss) */
  nodeId:    z.string().uuid().optional(),
  /** ID del tenant afectado (requerido para full_cluster_loss) */
  tenantId:  z.string().uuid().optional(),
  /** Modo dry-run: genera el plan sin ejecutar acciones reales */
  dryRun:    z.boolean().default(true),
});

export type SimulateDrInput = z.infer<typeof SimulateDrSchema>;
