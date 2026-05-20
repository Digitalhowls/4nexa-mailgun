-- Migration v3: DnsProvider table

CREATE TABLE "DnsProvider" (
  "id"           TEXT              NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"     TEXT              NOT NULL,
  "provider"     "DnsProviderType" NOT NULL,
  "encApiKey"    TEXT              NOT NULL,
  "encApiSecret" TEXT,
  "zoneId"       TEXT,
  "isActive"     BOOLEAN           NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT "DnsProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DnsProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE INDEX idx_dns_provider_tenant ON "DnsProvider"("tenantId");

-- Vincular Domain con DnsProvider
ALTER TABLE "Domain"
  ADD COLUMN IF NOT EXISTS "dnsProviderId" TEXT REFERENCES "DnsProvider"("id") ON DELETE SET NULL;

-- Campo origoCustomerId en Tenant
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "origoCustomerId" TEXT;
