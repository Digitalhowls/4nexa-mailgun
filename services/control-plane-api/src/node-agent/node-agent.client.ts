import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as https from 'node:https';
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

  /** Agente HTTPS para mTLS (reutilizable por petición). Se crea de forma lazy. */
  private mtlsAgent: https.Agent | undefined;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly jwtService: JwtService,
  ) {
    this.baseUrl = this.config.get('NODE_AGENT_BASE_URL');
    this.jwtSecret = this.config.get('NODE_AGENT_JWT_SECRET');
    this.jwtExpiresIn = this.config.get('NODE_AGENT_JWT_EXPIRES_IN');
  }

  /**
   * Construye (o reutiliza) un agente HTTPS con mTLS si están configuradas
   * las variables NODE_AGENT_MTLS_CERT, NODE_AGENT_MTLS_KEY, NODE_AGENT_MTLS_CA.
   */
  private getMtlsAgent(): https.Agent | undefined {
    const cert = this.config.get('NODE_AGENT_MTLS_CERT');
    const key = this.config.get('NODE_AGENT_MTLS_KEY');
    const ca = this.config.get('NODE_AGENT_MTLS_CA');

    if (!cert || !key || !ca) return undefined;

    if (!this.mtlsAgent) {
      this.mtlsAgent = new https.Agent({
        cert,
        key,
        ca,
        rejectUnauthorized: true,
      });
    }
    return this.mtlsAgent;
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
        expiresIn: this.jwtExpiresIn as never,
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

    const mtlsAgent = this.getMtlsAgent();
    const fetchOptions: RequestInit & { agent?: https.Agent } = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    };

    // Node.js fetch nativo no soporta `agent`, pero podemos inyectarlo
    // a través del dispatcher global o de http.globalAgent.
    // Alternativa: usamos http.request cuando hay mTLS.
    if (mtlsAgent) {
      (fetchOptions as Record<string, unknown>)['agent'] = mtlsAgent;
    }

    let response: Response;
    try {
      response = await (mtlsAgent
        ? NodeAgentClient.fetchWithAgent(url, fetchOptions, mtlsAgent)
        : fetch(url, fetchOptions));
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

  /**
   * Ejecuta un backup en el nodo agente.
   */
  async backup(
    nodeId: string,
    type: 'full' | 'incremental' | 'mailboxes' | 'config',
    targetPath?: string,
    tenantId?: string,
  ) {
    return this.call(nodeId, 'backup_execute', { type, targetPath, tenantId });
  }

  /**
   * Realiza una petición HTTPS utilizando el agente mTLS proporcionado.
   * El fetch nativo de Node.js no soporta agentes HTTPS personalizados,
   * por lo que usamos `https.request` directamente y lo envolvemos en una Promise.
   */
  private static fetchWithAgent(
    url: string,
    options: RequestInit,
    agent: https.Agent,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const bodyStr = typeof options.body === 'string' ? options.body : '';

      const headers = options.headers as Record<string, string>;
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port ? parseInt(parsed.port, 10) : 443,
          path: parsed.pathname + parsed.search,
          method: (options.method ?? 'GET').toUpperCase(),
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(bodyStr).toString(),
          },
          agent,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            // Construir un objeto Response-like compatible
            resolve(
              new Response(body, {
                status: res.statusCode ?? 500,
                headers: res.headers as Record<string, string>,
              }),
            );
          });
        },
      );

      req.on('error', reject);

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
