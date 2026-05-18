import type { ApplyConfigPayload, ApplyConfigAgentResult, ServiceName } from '../types';

/**
 * Interfaz abstracta para llamar al Node Agent desde el Config Engine.
 *
 * El consumidor (control-plane-api) inyecta un adaptador concreto
 * que envuelve NodeAgentClient.
 */
export abstract class NodeAgentCaller {
  /**
   * Envía una operación apply_config al nodo agente indicado.
   * El agente recibe las secciones de configuración, renderiza los templates
   * en disco y recarga los servicios indicados.
   */
  abstract applyConfig(
    nodeId: string,
    payload: ApplyConfigPayload,
  ): Promise<ApplyConfigAgentResult>;

  /**
   * Solicita al nodo agente recargar un servicio específico.
   */
  abstract reloadService(nodeId: string, service: ServiceName): Promise<void>;
}
