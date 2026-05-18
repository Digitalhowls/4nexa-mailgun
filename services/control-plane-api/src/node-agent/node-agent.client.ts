import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { createLogger } from '@4nexa/logger';
import type { EnvConfig } from '../config/env.schema';

const logger = createLogger({ service: 'control-plane-api', module: 'NodeAgentClient' });

export type AgentOperation =
  | 'apply_config'
  | 'reload_service'
  | 'health_check'
  | 'backup_execute'
  | 'metrics_report'
  | 'queue_stats';

export interface AgentRequestBody<T = unknown> {
  operation: AgentOperation;
  nodeId: string;
  correlationId: string;
  payload: T;
}

export interface AgentResponseBody<T = unknown> {
  success: boolean;
  correlationId: string;
  operation: AgentOperation;
  nodeId: string;
  executedAt: string;
  durationMs: number;
  data?: T;
  error?: string;
}

@Injectable()
export class NodeAgentClient {
  private readonly baseUrl: string;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly jwtService: JwtService,
  ) {
    this.baseUrl = this.config.get('NODE_AGENT_BASE_URL');
    this.jwtSecret = this.config.get('NODE_AGENT_JWT_SECRET');
    this.jwtExpiresIn = this.config.get('NODE_AGENT_JWT_EXPIRES_IN');
  }

  /**
   * Llama a un nodo agente con la operación indicada.
   * Genera un JWT firmado con el secreto compartido (§33, §6.4).
   */
  async call<TPayload, TResult>(
    nodeId: string,
    operation: AgentOperation,
    payload: TPayload,
  ): Promise<AgentResponseBody<TResult>> {
    const correlationId = crypto.randomUUID();
    const token = this.jwtService.sign(
      {
        sub: nodeId,
        iss: 'control-plane',
        scope: [operation],
      },
      {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiresIn,
      },
    );

    const body: AgentRequestBody<TPayload> = {
      operation,
      nodeId,
      correlationId,
      payload,
    };

    const url = `${this.baseUrl}/operations`;
    logger.info({ nodeId, operation, correlationId }, 'Enviando operación al agente');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        // timeout: fetch nativo no soporta AbortSignal en todos los entornos,
        // se gestiona con AbortController
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(err instanceof Error ? err : new Error(msg), `No se pudo conectar al agente del nodo ${nodeId}`);
      throw new ServiceUnavailableException(
        `Agente del nodo ${nodeId} no disponible: ${msg}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '(sin cuerpo)');
      logger.error(
        { nodeId, operation, correlationId, status: response.status, body: text },
        'Agente respondió con error HTTP',
      );
      throw new ServiceUnavailableException(
        `Agente del nodo ${nodeId} respondió ${response.status}`,
      );
    }

    const result = (await response.json()) as AgentResponseBody<TResult>;

    if (!result.success) {
      logger.warn({ nodeId, operation, correlationId, error: result.error }, 'Operación falló en el agente');
      throw new ServiceUnavailableException(
        `Operación "${operation}" falló en nodo ${nodeId}: ${result.error ?? 'error desconocido'}`,
      );
    }

    logger.info(
      { nodeId, operation, correlationId, durationMs: result.durationMs },
      'Operación completada en el agente',
    );

    return result;
  }

  /**
   * Verifica la salud de un nodo.
   */
  async healthCheck(nodeId: string) {
    return this.call(nodeId, 'health_check', { deep: false });
  }

  /**
   * Obtiene métricas del nodo.
   */
  async metricsReport(nodeId: string) {
    return this.call(nodeId, 'metrics_report', {});
  }

  /**
   * Obtiene estadísticas de cola SMTP.
   */
  async queueStats(nodeId: string, tenantId?: string) {
    return this.call(nodeId, 'queue_stats', { tenantId });
  }
}
