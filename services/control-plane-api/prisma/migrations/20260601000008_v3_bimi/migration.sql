-- Migration v3: BimiConfig table

CREATE TABLE "BimiConfig" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "domainId"  TEXT        NOT NULL UNIQUE,
  "svgUrl"    TEXT        NOT NULL,
  "vmcUrl"    TEXT,
  "validated" BOOLEAN     NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "BimiConfig_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "BimiConfig_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE
);
