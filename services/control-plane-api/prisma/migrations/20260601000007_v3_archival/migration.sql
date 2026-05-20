-- Migration v3: ArchivalPolicy + LegalHold tables

CREATE TABLE "ArchivalPolicy" (
  "id"            TEXT                 NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"      TEXT                 NOT NULL UNIQUE,
  "retentionDays" INTEGER              NOT NULL DEFAULT 365,
  "storageType"   "ArchivalStorageType" NOT NULL DEFAULT 'LOCAL',
  "s3Bucket"      TEXT,
  "s3Prefix"      TEXT,
  "createdAt"     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

  CONSTRAINT "ArchivalPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArchivalPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE TABLE "LegalHold" (
  "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"     TEXT        NOT NULL,
  "mailboxId"    TEXT        NOT NULL,
  "reason"       TEXT        NOT NULL,
  "createdById"  TEXT        NOT NULL,
  "releasedAt"   TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegalHold_tenantId_fkey"  FOREIGN KEY ("tenantId")  REFERENCES "Tenant"("id")  ON DELETE CASCADE,
  CONSTRAINT "LegalHold_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE
);

CREATE INDEX idx_legal_hold_tenant   ON "LegalHold"("tenantId");
CREATE INDEX idx_legal_hold_mailbox  ON "LegalHold"("mailboxId");
