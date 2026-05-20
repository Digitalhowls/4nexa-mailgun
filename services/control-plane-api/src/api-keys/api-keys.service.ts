import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ApiKeyScope } from '@prisma/client';

export interface CreateApiKeyDto {
  name: string;
  scopes: ApiKeyScope[];
  rateLimit?: number;
  expiresAt?: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Crea una nueva API key. Devuelve el valor en texto plano SOLO en este momento. */
  async create(
    tenantId: string,
    dto: CreateApiKeyDto,
    createdBy: string,
  ): Promise<{ apiKey: ApiKeyDto; plainKey: string }> {
    // Generar valor aleatorio: prefijo 8 chars + 40 chars de entropía
    const rawBytes = randomBytes(30).toString('hex'); // 60 hex chars
    const prefix = rawBytes.slice(0, 8);
    const fullKey = `4nx_${prefix}_${rawBytes.slice(8)}`;

    // Hash SHA-256 para almacenamiento (no bcrypt — las API keys se comparan por hash)
    const keyHash = createHash('sha256').update(fullKey).digest('hex');

    const record = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: dto.name,
        keyHash,
        keyPrefix: prefix,
        scopes: dto.scopes,
        rateLimit: dto.rateLimit ?? 1000,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy,
      },
    });

    await this.audit.log({
      tenantId,
      userId: createdBy,
      action: 'api_key.created',
      entityType: 'ApiKey',
      entityId: record.id,
      metadata: { name: dto.name, scopes: dto.scopes },
    });

    return { apiKey: this.toDto(record), plainKey: fullKey };
  }

  async list(tenantId: string): Promise<ApiKeyDto[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => this.toDto(k));
  }

  async revoke(id: string, tenantId: string, userId: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key no encontrada');

    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });

    await this.audit.log({
      tenantId,
      userId,
      action: 'api_key.revoked',
      entityType: 'ApiKey',
      entityId: id,
    });
  }

  async rotate(
    id: string,
    tenantId: string,
    userId: string,
  ): Promise<{ apiKey: ApiKeyDto; plainKey: string }> {
    const existing = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('API key no encontrada');
    if (!existing.isActive) throw new ForbiddenException('La API key está revocada');

    // Invalidar la antigua
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });

    // Crear nueva con los mismos parámetros
    return this.create(
      tenantId,
      {
        name: `${existing.name} (rotada)`,
        scopes: existing.scopes,
        rateLimit: existing.rateLimit,
        expiresAt: existing.expiresAt?.toISOString(),
      },
      userId,
    );
  }

  /** Valida una API key entrante. Devuelve el registro si es válida. */
  async validate(plainKey: string) {
    const keyHash = createHash('sha256').update(plainKey).digest('hex');
    const record = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!record) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    // Actualizar lastUsedAt (best-effort, no bloqueante)
    this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {/* ignorar errores de actualización */});

    return record;
  }

  private toDto(record: {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: ApiKeyScope[];
    rateLimit: number;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    createdBy: string;
  }): ApiKeyDto {
    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      rateLimit: record.rateLimit,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      isActive: record.isActive,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
    };
  }
}
