import { z } from 'zod';

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(['FULL', 'READ_ONLY', 'SEND_ONLY', 'WEBHOOKS']).default('FULL'),
  expiresAt: z.string().datetime().optional(),
});

export const CreateDnsProviderSchema = z.object({
  provider: z.enum(['CLOUDFLARE', 'HETZNER', 'OVH', 'ROUTE53', 'POWERDNS', 'MANUAL']),
  apiKey: z.string().min(1),
  apiSecret: z.string().optional(),
  zoneId: z.string().optional(),
});

export const SetArchivalPolicySchema = z.object({
  retentionDays: z.number().int().min(30).max(3650),
  storageType: z.enum(['LOCAL', 'S3', 'AZURE_BLOB']),
  s3Bucket: z.string().optional(),
  s3Prefix: z.string().optional(),
});

export const CreateLegalHoldSchema = z.object({
  mailboxId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export const BimiConfigSchema = z.object({
  svgUrl: z.string().url().startsWith('https://').endsWith('.svg'),
  vmcUrl: z.string().url().optional(),
});

export const CreateNotificationChannelSchema = z.object({
  type: z.enum(['EMAIL', 'SLACK', 'WEBHOOK', 'SMS']),
  name: z.string().min(1).max(100),
  config: z.record(z.string()),
});

export const WhitelabelConfigSchema = z.object({
  brandName: z.string().min(1).max(100),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Formato HEX inválido (#RRGGBB)'),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  customDomain: z.string().optional(),
  supportEmail: z.string().email().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type CreateDnsProviderInput = z.infer<typeof CreateDnsProviderSchema>;
export type SetArchivalPolicyInput = z.infer<typeof SetArchivalPolicySchema>;
export type CreateLegalHoldInput = z.infer<typeof CreateLegalHoldSchema>;
export type BimiConfigInput = z.infer<typeof BimiConfigSchema>;
export type CreateNotificationChannelInput = z.infer<typeof CreateNotificationChannelSchema>;
export type WhitelabelConfigInput = z.infer<typeof WhitelabelConfigSchema>;
