import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpsertAntispamPolicyInput, EvaluateMessageInput } from '@4nexa/validators';

export type EvaluateAction = 'ACCEPT' | 'FLAG' | 'REJECT' | 'GREYLISTED';

export interface EvaluateResult {
  action: EvaluateAction;
  score: number;
  reason: string;
}

@Injectable()
export class AntispamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Crear o actualizar política ────────────────────────────────────────────

  async upsertPolicy(
    domainId: string,
    input: UpsertAntispamPolicyInput,
    userId?: string,
  ) {
    // Verificar que el dominio existe
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, tenantId: true, deletedAt: true },
    });
    if (!domain || domain.deletedAt) {
      throw new NotFoundException(`Dominio ${domainId} no encontrado`);
    }

    const policy = await this.prisma.antispamPolicy.upsert({
      where: { domainId },
      create: {
        domainId,
        enabled: input.enabled,
        spamThreshold: input.spamThreshold,
        rejectAbove: input.rejectAbove,
        greylistEnabled: input.greylistEnabled,
        whitelist: input.whitelist,
        blacklist: input.blacklist,
      },
      update: {
        enabled: input.enabled,
        spamThreshold: input.spamThreshold,
        rejectAbove: input.rejectAbove,
        greylistEnabled: input.greylistEnabled,
        whitelist: input.whitelist,
        blacklist: input.blacklist,
      },
    });

    await this.audit.log({
      action: 'antispam.policy_upserted',
      entityType: 'domain',
      entityId: domainId,
      tenantId: domain.tenantId,
      userId,
      metadata: { spamThreshold: input.spamThreshold, rejectAbove: input.rejectAbove },
    });

    return policy;
  }

  // ── Obtener política ───────────────────────────────────────────────────────

  async getPolicy(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, deletedAt: true },
    });
    if (!domain || domain.deletedAt) {
      throw new NotFoundException(`Dominio ${domainId} no encontrado`);
    }

    const policy = await this.prisma.antispamPolicy.findUnique({
      where: { domainId },
    });

    // Si no hay política devolver defaults
    if (!policy) {
      return {
        domainId,
        exists: false,
        defaults: {
          enabled: true,
          spamThreshold: 0.80,
          rejectAbove: 0.95,
          greylistEnabled: false,
          whitelist: [] as string[],
          blacklist: [] as string[],
        },
      };
    }

    return { exists: true, ...policy };
  }

  // ── Eliminar política ─────────────────────────────────────────────────────

  async deletePolicy(domainId: string, userId?: string) {
    const policy = await this.prisma.antispamPolicy.findUnique({ where: { domainId } });
    if (!policy) throw new NotFoundException(`No existe política para dominio ${domainId}`);

    await this.prisma.antispamPolicy.delete({ where: { domainId } });

    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      select: { tenantId: true },
    });

    await this.audit.log({
      action: 'antispam.policy_deleted',
      entityType: 'domain',
      entityId: domainId,
      tenantId: domain?.tenantId,
      userId,
    });

    return { deleted: true };
  }

  // ── Evaluar un mensaje contra la política ─────────────────────────────────

  async evaluateMessage(
    domainId: string,
    input: EvaluateMessageInput,
  ): Promise<EvaluateResult> {
    const policy = await this.prisma.antispamPolicy.findUnique({ where: { domainId } });

    // Sin política → aceptar
    if (!policy || !policy.enabled) {
      return { action: 'ACCEPT', score: input.spamScore ?? 0, reason: 'no_policy' };
    }

    const { senderEmail, spamScore = 0 } = input;
    const senderDomain = senderEmail.split('@')[1] ?? '';

    // 1. Whitelist — ACCEPT inmediato
    if (this.matchList(senderEmail, senderDomain, policy.whitelist)) {
      return { action: 'ACCEPT', score: spamScore, reason: 'whitelisted' };
    }

    // 2. Blacklist — REJECT inmediato
    if (this.matchList(senderEmail, senderDomain, policy.blacklist)) {
      return { action: 'REJECT', score: 1.0, reason: 'blacklisted' };
    }

    // 3. Greylisting (primera aparición → greylist)
    if (policy.greylistEnabled) {
      const isNew = await this.isFirstContact(domainId, senderEmail);
      if (isNew) {
        return { action: 'GREYLISTED', score: spamScore, reason: 'greylisted_new_sender' };
      }
    }

    // 4. Umbral de rechazo
    if (spamScore >= policy.rejectAbove) {
      return { action: 'REJECT', score: spamScore, reason: `score_${spamScore.toFixed(2)}_above_rejectAbove` };
    }

    // 5. Umbral de marcado como spam
    if (spamScore >= policy.spamThreshold) {
      return { action: 'FLAG', score: spamScore, reason: `score_${spamScore.toFixed(2)}_above_spamThreshold` };
    }

    return { action: 'ACCEPT', score: spamScore, reason: 'below_threshold' };
  }

  // ── Helpers privados ───────────────────────────────────────────────────────

  /** Comprueba si email o dominio aparecen en la lista */
  private matchList(email: string, domain: string, list: string[]): boolean {
    const emailLower  = email.toLowerCase();
    const domainLower = domain.toLowerCase();
    return list.some((entry) => {
      const e = entry.toLowerCase();
      return e === emailLower || e === domainLower;
    });
  }

  /**
   * Greylisting mínimo: un remitente se considera "nuevo" si no tiene ningún
   * MailEvent de tipo SENT en las últimas 24 h para el dominio destino.
   * En una primera llamada retornará true (greylisted). En el reintento
   * (que ocurriría en el servidor SMTP real) ya existirían eventos previos.
   */
  private async isFirstContact(domainId: string, senderEmail: string): Promise<boolean> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.mailEvent.count({
      where: {
        domainId,
        type: 'SENT',
        fromEmail: senderEmail,
        occurredAt: { gte: since },
      },
    });
    return count === 0;
  }
}
