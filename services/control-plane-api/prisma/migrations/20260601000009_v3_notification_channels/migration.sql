-- Migration v3: NotificationChannel table

CREATE TABLE "NotificationChannel" (
  "id"          TEXT               NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenantId"    TEXT               NOT NULL,
  "type"        "NotificationType" NOT NULL,
  "name"        TEXT               NOT NULL,
  "configJson"  TEXT               NOT NULL DEFAULT '{}',
  "enabled"     BOOLEAN            NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT "NotificationChannel_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "NotificationChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE INDEX idx_notification_channel_tenant ON "NotificationChannel"("tenantId");
