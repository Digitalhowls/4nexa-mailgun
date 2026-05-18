import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  userId?: string;
  tenantId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        tenantId: params.tenantId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
