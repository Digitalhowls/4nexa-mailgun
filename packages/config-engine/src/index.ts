// ─── Módulo NestJS ────────────────────────────────────────────────────────────
export { ConfigEngineModule } from './config-engine.module';
export type { ConfigEngineModuleOptions } from './config-engine.module';

// ─── Servicio principal ───────────────────────────────────────────────────────
export { ConfigEngineService } from './config-engine.service';

// ─── Proveedores abstractos (implementar en el consumidor) ────────────────────
export { ConfigDataProvider } from './providers/config-data.provider';
export { NodeAgentCaller } from './providers/node-agent-caller.provider';

// ─── Builders (funciones puras, reutilizables en tests) ───────────────────────
export { buildPostfixParams } from './builders/postfix.builder';
export { buildDovecotParams } from './builders/dovecot.builder';
export { buildRspamdParams } from './builders/rspamd.builder';

// ─── Validadores ──────────────────────────────────────────────────────────────
export {
  validateNodeConfigBundle,
  validatePostfixParams,
  validateDovecotParams,
  validateRspamdParams,
  PostfixParamsSchema,
  DovecotParamsSchema,
  RspamdParamsSchema,
} from './validators/config.schemas';

// ─── Tipos públicos ───────────────────────────────────────────────────────────
export type {
  DomainConfigData,
  MailboxConfigData,
  AliasConfigData,
  NodeConfigBundle,
  PostfixParams,
  DovecotParams,
  RspamdParams,
  ConfigApplyResult,
  ConfigValidationResult,
  ServiceName,
  ConfigSection,
  ApplyConfigPayload,
  ApplyConfigAgentResult,
} from './types';
