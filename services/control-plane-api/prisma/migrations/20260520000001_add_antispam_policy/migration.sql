-- §27 Antispam policies table
CREATE TABLE "antispam_policies" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "domainId"        UUID NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "spamThreshold"   DOUBLE PRECISION NOT NULL DEFAULT 0.80,
  "rejectAbove"     DOUBLE PRECISION NOT NULL DEFAULT 0.95,
  "greylistEnabled" BOOLEAN NOT NULL DEFAULT false,
  "whitelist"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "blacklist"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "antispam_policies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "antispam_policies"
  ADD CONSTRAINT "antispam_policies_domainId_fkey"
  FOREIGN KEY ("domainId") REFERENCES "domains"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "antispam_policies_domainId_key" ON "antispam_policies"("domainId");
