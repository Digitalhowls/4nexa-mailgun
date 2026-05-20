-- Migration v3: ExtractedInvoice table

CREATE TABLE "ExtractedInvoice" (
  "id"         TEXT                      NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"   TEXT                      NOT NULL,
  "mailboxId"  TEXT,
  "vendor"     TEXT,
  "amount"     NUMERIC(12,2),
  "currency"   TEXT                      NOT NULL DEFAULT 'EUR',
  "invoiceDate" DATE,
  "rawText"    TEXT,
  "status"     "InvoiceExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ               NOT NULL DEFAULT NOW(),

  CONSTRAINT "ExtractedInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExtractedInvoice_tenantId_fkey"  FOREIGN KEY ("tenantId")  REFERENCES "Tenant"("id")  ON DELETE CASCADE,
  CONSTRAINT "ExtractedInvoice_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL
);

CREATE INDEX idx_extracted_invoice_tenant  ON "ExtractedInvoice"("tenantId");
