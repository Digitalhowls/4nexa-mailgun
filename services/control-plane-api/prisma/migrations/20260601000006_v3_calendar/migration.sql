-- Migration v3: CalendarConfig table

CREATE TABLE "CalendarConfig" (
  "id"         TEXT               NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "mailboxId"  TEXT               NOT NULL UNIQUE,
  "enabled"    BOOLEAN            NOT NULL DEFAULT FALSE,
  "easEnabled" BOOLEAN            NOT NULL DEFAULT FALSE,
  "shareType"  "CalendarShareType" NOT NULL DEFAULT 'PRIVATE',
  "createdAt"  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT "CalendarConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarConfig_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE
);
