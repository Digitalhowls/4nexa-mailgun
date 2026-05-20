export const FEATURES = {
  AI_ENGINE: process.env.FEATURE_AI === 'true',
  DNS_ORCHESTRATION: process.env.FEATURE_DNS_ORCH === 'true',
  WEBMAIL: process.env.FEATURE_WEBMAIL === 'true',
  GROUPWARE: process.env.FEATURE_GROUPWARE === 'true',
  BIMI: process.env.FEATURE_BIMI === 'true',
  ARCHIVAL: process.env.FEATURE_ARCHIVAL === 'true',
  WHITELABEL: process.env.FEATURE_WHITELABEL === 'true',
  ORIZON: process.env.FEATURE_ORIZON === 'true',
} as const;

export type FeatureKey = keyof typeof FEATURES;
