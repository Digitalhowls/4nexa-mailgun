-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: add_brain_memory_cells (§14 Mailgun Brain)
-- Crea el tipo enum MemoryCellScope y la tabla memory_cells
-- ──────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "MemoryCellScope" AS ENUM (
    'REPUTATION',
    'DELIVERABILITY',
    'SUPPORT',
    'ABUSE',
    'RECOVERY',
    'MIGRATION',
    'OPERATIONAL'
);

-- CreateTable
CREATE TABLE "memory_cells" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"    UUID,
    "scope"       "MemoryCellScope" NOT NULL,
    "key"         VARCHAR(200) NOT NULL,
    "payload"     JSONB        NOT NULL,
    "expiresAt"   TIMESTAMPTZ,
    "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updatedAt"   TIMESTAMPTZ  NOT NULL,
    "createdBy"   VARCHAR(100) NOT NULL DEFAULT 'system',
    "version"     INTEGER      NOT NULL DEFAULT 1,

    CONSTRAINT "memory_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- NULLS NOT DISTINCT (PostgreSQL 15+) garantiza que (NULL, scope, key) sea único:
-- sin esto NULL != NULL en el índice y no se detectarían duplicados de celdas sistema.
CREATE UNIQUE INDEX "memory_cells_tenantId_scope_key_key"
    ON "memory_cells"("tenantId", "scope", "key") NULLS NOT DISTINCT;

CREATE INDEX "memory_cells_tenantId_idx"  ON "memory_cells"("tenantId");
CREATE INDEX "memory_cells_scope_idx"     ON "memory_cells"("scope");
CREATE INDEX "memory_cells_expiresAt_idx" ON "memory_cells"("expiresAt");
