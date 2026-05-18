import type { DomainConfigData, MailboxConfigData, AliasConfigData } from '../types';

/**
 * Proveedor abstracto de datos de configuración.
 *
 * El consumidor (control-plane-api) inyecta una implementación concreta
 * que usa PrismaService para leer dominios, buzones y alias del nodo indicado.
 *
 * Uso de clase abstracta en vez de interface para que funcione como
 * token de inyección de NestJS.
 */
export abstract class ConfigDataProvider {
  /**
   * Devuelve todos los dominios ACTIVE asociados al nodo indicado.
   * Sólo se incluyen dominios con status = 'ACTIVE' y DKIM completamente configurado.
   */
  abstract getDomainsByNodeId(nodeId: string): Promise<DomainConfigData[]>;

  /**
   * Devuelve todos los buzones ACTIVE de los dominios del nodo indicado.
   * Incluye el hash de contraseña (Argon2id) para Dovecot.
   */
  abstract getMailboxesByNodeId(nodeId: string): Promise<MailboxConfigData[]>;

  /**
   * Devuelve todos los alias activos de los dominios del nodo indicado.
   */
  abstract getAliasesByNodeId(nodeId: string): Promise<AliasConfigData[]>;
}
