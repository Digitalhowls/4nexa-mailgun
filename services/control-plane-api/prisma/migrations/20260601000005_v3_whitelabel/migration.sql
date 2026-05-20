-- Migration v3: WhitelabelConfig table

CREATE TABLE "WhitelabelConfig" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"      TEXT        NOT NULL UNIQUE,
  "brandName"     TEXT        NOT NULL,
  "primaryColor"  TEXT        NOT NULL DEFAULT '#6366f1',
  "logoUrl"       TEXT,
  "faviconUrl"    TEXT,
  "customDomain"  TEXT,
  "supportEmail"  TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "WhitelabelConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhitelabelConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);
