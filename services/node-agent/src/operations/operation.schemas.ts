import { z } from 'zod';

const SERVICE_NAMES = ['postfix', 'dovecot', 'rspamd'] as const;

export const AgentRequestBaseSchema = z.object({
  operation: z.enum([
    'apply_config',
    'reload_service',
    'health_check',
    'backup_execute',
    'metrics_report',
    'queue_stats',
  ]),
  nodeId: z.string().uuid(),
  correlationId: z.string().uuid(),
});

export const ApplyConfigPayloadSchema = z.object({
  sections: z.array(
    z.object({
      service: z.enum(SERVICE_NAMES),
      templateKey: z.string().min(1).max(100),
      parameters: z.record(z.unknown()),
    }),
  ).min(1),
  reloadServices: z.array(z.enum(SERVICE_NAMES)),
});

export const ReloadServicePayloadSchema = z.object({
  service: z.enum(SERVICE_NAMES),
  reason: z.string().max(200).optional(),
});

export const HealthCheckPayloadSchema = z.object({
  deep: z.boolean().optional(),
});

export const BackupExecutePayloadSchema = z.object({
  type: z.enum(['full', 'incremental', 'mailboxes', 'config']),
  targetPath: z.string().max(500).optional(),
  tenantId: z.string().uuid().optional(),
});

export const MetricsReportPayloadSchema = z.object({
  since: z.string().datetime().optional(),
});

export const QueueStatsPayloadSchema = z.object({
  tenantId: z.string().uuid().optional(),
});

// Mapa de operation → schema del payload
export const PAYLOAD_SCHEMAS = {
  apply_config: ApplyConfigPayloadSchema,
  reload_service: ReloadServicePayloadSchema,
  health_check: HealthCheckPayloadSchema,
  backup_execute: BackupExecutePayloadSchema,
  metrics_report: MetricsReportPayloadSchema,
  queue_stats: QueueStatsPayloadSchema,
} as const;
