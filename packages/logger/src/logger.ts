import pino, { Logger as PinoLogger } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  tenantId?: string;
  domainId?: string;
  mailboxId?: string;
  nodeId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface Logger {
  trace(context: LogContext, message: string): void;
  debug(context: LogContext, message: string): void;
  info(context: LogContext, message: string): void;
  warn(context: LogContext, message: string): void;
  error(context: LogContext | Error, message?: string): void;
  fatal(context: LogContext | Error, message?: string): void;
  child(context: LogContext): Logger;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLogger(options: {
  service: string;
  level?: LogLevel;
  pretty?: boolean;
}): Logger {
  const { service, level = 'info', pretty = false } = options;

  const transport = pretty
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
    : undefined;

  const pinoInstance: PinoLogger = pino(
    {
      level,
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
      // Never log sensitive fields
      redact: {
        paths: ['password', 'passwordHash', 'token', 'refreshToken', 'totpSecret', 'dkimPrivateKey'],
        censor: '[REDACTED]',
      },
    },
    transport,
  );

  return buildLogger(pinoInstance);
}

function buildLogger(pino: PinoLogger): Logger {
  return {
    trace: (context, message) => pino.trace(context, message),
    debug: (context, message) => pino.debug(context, message),
    info: (context, message) => pino.info(context, message),
    warn: (context, message) => pino.warn(context, message),
    error: (contextOrError, message) => {
      if (contextOrError instanceof Error) {
        pino.error({ err: contextOrError }, message ?? contextOrError.message);
      } else {
        pino.error(contextOrError, message ?? 'Error');
      }
    },
    fatal: (contextOrError, message) => {
      if (contextOrError instanceof Error) {
        pino.fatal({ err: contextOrError }, message ?? contextOrError.message);
      } else {
        pino.fatal(contextOrError, message ?? 'Fatal error');
      }
    },
    child: (context) => buildLogger(pino.child(context)),
  };
}
