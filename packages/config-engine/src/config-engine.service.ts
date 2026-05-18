import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createLogger } from '@4nexa/logger';
import { ConfigDataProvider } from './providers/config-data.provider';
import { NodeAgentCaller } from './providers/node-agent-caller.provider';
import { buildPostfixParams } from './builders/postfix.builder';
import { buildDovecotParams } from './builders/dovecot.builder';
import { buildRspamdParams } from './builders/rspamd.builder';
import {
  validateNodeConfigBundle,
  validatePostfixParams,
  validateDovecotParams,
  validateRspamdParams,
} from './validators/config.schemas';
import type {
  NodeConfigBundle,
  ConfigApplyResult,
  ConfigValidationResult,
  ApplyConfigPayload,
} from './types';

const logger = createLogger({ service: 'config-engine', module: 'ConfigEngineService' });

/**
 * Servicio principal del Config Engine.
 *
 * Implementa el pipeline completo de generación y aplicación de configuración:
 *
 * 1. Recopilación de estado desde DB  → ConfigDataProvider
 * 2. Validación del bundle            → validateNodeConfigBundle()
 * 3. Construcción de parámetros       → builders por servicio
 * 4. Validación de parámetros         → validators por servicio
 * 5. Empaquetado en ConfigSections    → ApplyConfigPayload
 * 6. Envío al nodo agente             → NodeAgentCaller.applyConfig()
 *
 * El nodo agente recibe las secciones, renderiza los templates en disco
 * y recarga los servicios (Postfix, Dovecot, Rspamd) de forma controlada.
 */
@Injectable()
export class ConfigEngineService {
  constructor(
    private readonly dataProvider: ConfigDataProvider,
    private readonly agentCaller: NodeAgentCaller,
  ) {}

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Genera y aplica la configuración completa para un nodo.
   *
   * @param nodeId UUID del nodo de correo objetivo
   * @returns Resultado de la operación apply_config
   * @throws BadRequestException si la validación del bundle falla
   * @throws ServiceUnavailableException si el agente no responde
   */
  async applyNodeConfig(nodeId: string): Promise<ConfigApplyResult> {
    logger.info({ nodeId }, 'Iniciando pipeline de configuración');

    // 1. Recopilar estado desde DB
    const bundle = await this.buildBundle(nodeId);

    // 2. Validar el bundle completo
    const bundleValidation = validateNodeConfigBundle(bundle);
    this.logValidation(bundleValidation, 'bundle', nodeId);
    if (!bundleValidation.valid) {
      throw new BadRequestException(
        `Bundle de configuración inválido para nodo ${nodeId}: ${bundleValidation.errors.join('; ')}`,
      );
    }

    // 3. Construir parámetros por servicio
    const postfixParams = buildPostfixParams(bundle.domains, bundle.mailboxes, bundle.aliases);
    const dovecotParams = buildDovecotParams(bundle.mailboxes);
    const rspamdParams = buildRspamdParams(bundle.domains);

    // 4. Validar parámetros por servicio
    const postfixValidation = validatePostfixParams(postfixParams);
    const dovecotValidation = validateDovecotParams(dovecotParams);
    const rspamdValidation = validateRspamdParams(rspamdParams);

    this.logValidation(postfixValidation, 'postfix', nodeId);
    this.logValidation(dovecotValidation, 'dovecot', nodeId);
    this.logValidation(rspamdValidation, 'rspamd', nodeId);

    const allErrors = [
      ...postfixValidation.errors,
      ...dovecotValidation.errors,
      ...rspamdValidation.errors,
    ];

    if (allErrors.length > 0) {
      throw new BadRequestException(
        `Parámetros de configuración inválidos para nodo ${nodeId}: ${allErrors.join('; ')}`,
      );
    }

    // 5. Empaquetar en ApplyConfigPayload
    const payload: ApplyConfigPayload = {
      sections: [
        {
          service: 'postfix',
          templateKey: 'postfix-virtual-hosting',
          parameters: postfixParams as unknown as Record<string, unknown>,
        },
        {
          service: 'dovecot',
          templateKey: 'dovecot-userdb',
          parameters: dovecotParams as unknown as Record<string, unknown>,
        },
        {
          service: 'rspamd',
          templateKey: 'rspamd-dkim-domains',
          parameters: rspamdParams as unknown as Record<string, unknown>,
        },
      ],
      reloadServices: ['postfix', 'dovecot', 'rspamd'],
    };

    // 6. Enviar al nodo agente
    logger.info(
      { nodeId, sections: payload.sections.length },
      'Enviando configuración al nodo agente',
    );

    const agentResult = await this.agentCaller.applyConfig(nodeId, payload);

    const result: ConfigApplyResult = {
      nodeId,
      success: true,
      appliedAt: new Date().toISOString(),
      appliedSections: agentResult.appliedSections,
      reloadedServices: agentResult.reloadedServices,
      configVersion: agentResult.configVersion,
    };

    logger.info(
      { nodeId, configVersion: agentResult.configVersion },
      'Configuración aplicada con éxito',
    );

    return result;
  }

  /**
   * Solo construye y valida el bundle para un nodo, sin aplicarlo.
   * Útil para comprobar el estado antes de aplicar.
   *
   * @param nodeId UUID del nodo objetivo
   */
  async validateNodeConfig(nodeId: string): Promise<ConfigValidationResult> {
    const bundle = await this.buildBundle(nodeId);
    const bundleValidation = validateNodeConfigBundle(bundle);

    const postfixParams = buildPostfixParams(bundle.domains, bundle.mailboxes, bundle.aliases);
    const dovecotParams = buildDovecotParams(bundle.mailboxes);
    const rspamdParams = buildRspamdParams(bundle.domains);

    const postfixValidation = validatePostfixParams(postfixParams);
    const dovecotValidation = validateDovecotParams(dovecotParams);
    const rspamdValidation = validateRspamdParams(rspamdParams);

    return {
      valid:
        bundleValidation.valid &&
        postfixValidation.valid &&
        dovecotValidation.valid &&
        rspamdValidation.valid,
      errors: [
        ...bundleValidation.errors,
        ...postfixValidation.errors,
        ...dovecotValidation.errors,
        ...rspamdValidation.errors,
      ],
      warnings: [
        ...bundleValidation.warnings,
        ...postfixValidation.warnings,
        ...dovecotValidation.warnings,
        ...rspamdValidation.warnings,
      ],
    };
  }

  /**
   * Recarga un único servicio en el nodo sin regenerar configuración.
   * Útil tras cambios de certificados TLS u otros cambios menores.
   */
  async reloadService(
    nodeId: string,
    service: 'postfix' | 'dovecot' | 'rspamd',
  ): Promise<void> {
    logger.info({ nodeId, service }, 'Solicitando recarga de servicio');
    try {
      await this.agentCaller.reloadService(nodeId, service);
      logger.info({ nodeId, service }, 'Servicio recargado');
    } catch (err) {
      logger.error({ nodeId, service, err }, 'Error recargando servicio');
      throw new ServiceUnavailableException(
        `No se pudo recargar ${service} en el nodo ${nodeId}`,
      );
    }
  }

  // ── Privados ─────────────────────────────────────────────────────────────────

  private async buildBundle(nodeId: string): Promise<NodeConfigBundle> {
    const [domains, mailboxes, aliases] = await Promise.all([
      this.dataProvider.getDomainsByNodeId(nodeId),
      this.dataProvider.getMailboxesByNodeId(nodeId),
      this.dataProvider.getAliasesByNodeId(nodeId),
    ]);

    logger.info(
      { nodeId, domains: domains.length, mailboxes: mailboxes.length, aliases: aliases.length },
      'Bundle de configuración construido',
    );

    return {
      nodeId,
      generatedAt: new Date().toISOString(),
      domains,
      mailboxes,
      aliases,
    };
  }

  private logValidation(result: ConfigValidationResult, section: string, nodeId: string): void {
    if (result.warnings.length > 0) {
      logger.warn(
        { nodeId, section, warnings: result.warnings },
        'Advertencias en validación de configuración',
      );
    }
    if (!result.valid) {
      logger.error(
        { nodeId, section, errors: result.errors },
        'Errores en validación de configuración',
      );
    }
  }
}
