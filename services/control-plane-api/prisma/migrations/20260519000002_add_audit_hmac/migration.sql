-- §29.3 Tamper detection: añade campo HMAC a audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "hmac" VARCHAR(64) NOT NULL DEFAULT '';
