-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: add_migration_jobs (§15 Arquitectura de migraciones IMAP)
-- ──────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "MigrationProvider" AS ENUM (
    'GOOGLE_WORKSPACE',
    'MICROSOFT_365',
    'CPANEL',
    'PLESK',
    'ZIMBRA',
    'GENERIC_IMAP'
);

CREATE TYPE "MigrationStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'PAUSED',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);

-- CreateTable
CREATE TABLE "migration_jobs" (
    "id"                      UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenantId"                UUID          NOT NULL,
    "mailboxId"               UUID,
    "provider"                "MigrationProvider" NOT NULL,
    "status"                  "MigrationStatus"   NOT NULL DEFAULT 'PENDING',
    "sourceHost"              VARCHAR(255)  NOT NULL,
    "sourcePort"              INTEGER       NOT NULL DEFAULT 993,
    "sourceUsername"          VARCHAR(255)  NOT NULL,
    "sourceEncryptedPassword" TEXT          NOT NULL,
    "sourceTls"               BOOLEAN       NOT NULL DEFAULT true,
    "foldersTotal"            INTEGER       NOT NULL DEFAULT 0,
    "foldersImported"         INTEGER       NOT NULL DEFAULT 0,
    "messagesTotal"           INTEGER       NOT NULL DEFAULT 0,
    "messagesImported"        INTEGER       NOT NULL DEFAULT 0,
    "bytesTotal"              BIGINT        NOT NULL DEFAULT 0,
    "bytesImported"           BIGINT        NOT NULL DEFAULT 0,
    "errorMessage"            TEXT,
    "startedAt"               TIMESTAMPTZ,
    "completedAt"             TIMESTAMPTZ,
    "createdAt"               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    "updatedAt"               TIMESTAMPTZ   NOT NULL,
    "createdBy"               VARCHAR(100)  NOT NULL,

    CONSTRAINT "migration_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "migration_jobs_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "migration_jobs_tenantId_idx"  ON "migration_jobs"("tenantId");
CREATE INDEX "migration_jobs_status_idx"    ON "migration_jobs"("status");
CREATE INDEX "migration_jobs_provider_idx"  ON "migration_jobs"("provider");
