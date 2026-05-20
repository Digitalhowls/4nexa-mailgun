-- Migration v3: ApiKey table

CREATE TABLE "ApiKey" (
  "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"    TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "keyHash"     TEXT         NOT NULL UNIQUE,
  "prefix"      TEXT         NOT NULL,
  "scope"       "ApiKeyScope" NOT NULL DEFAULT 'FULL',
  "expiresAt"   TIMESTAMPTZ,
  "lastUsedAt"  TIMESTAMPTZ,
  "isActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE INDEX idx_api_key_tenant ON "ApiKey"("tenantId");
CREATE INDEX idx_api_key_hash ON "ApiKey"("keyHash");
