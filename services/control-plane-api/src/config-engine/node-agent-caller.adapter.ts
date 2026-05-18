import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { NodeAgentCaller } from '@4nexa/config-engine';
import type { ApplyConfigPayload, ApplyConfigAgentResult, ServiceName } from '@4nexa/config-engine';
import { NodeAgentClient } from '../node-agent/node-agent.client';

/**
 * Adaptador que envuelve NodeAgentClient para implementar la interfaz NodeAgentCaller
 * esperada por el Config Engine.
 *
 * Traduce los tipos de @4nexa/config-engine a los tipos de NodeAgentClient
 * y maneja los errores de comunicación con el agente.
 */
@Injectable()
export class NodeAgentCallerAdapter extends NodeAgentCaller {
  constructor(private readonly agentClient: NodeAgentClient) {
    super();
  }

  async applyConfig(
    nodeId: string,
    payload: ApplyConfigPayload,
  ): Promise<ApplyConfigAgentResult> {
    const response = await this.agentClient.call<ApplyConfigPayload, ApplyConfigAgentResult>(
      nodeId,
      'apply_config',
      payload,
    );

    if (!response.success || !response.data) {
      throw new ServiceUnavailableException(
        `El nodo agente ${nodeId} rechazó apply_config: ${response.error ?? 'sin detalles'}`,
      );
    }

    return response.data;
  }

  async reloadService(nodeId: string, service: ServiceName): Promise<void> {
    const response = await this.agentClient.call<{ service: ServiceName; reason: string }, { service: ServiceName; status: string }>(
      nodeId,
      'reload_service',
      { service, reason: 'config-engine-reload' },
    );

    if (!response.success) {
      throw new ServiceUnavailableException(
        `El nodo agente ${nodeId} no pudo recargar ${service}: ${response.error ?? 'sin detalles'}`,
      );
    }
  }
}
