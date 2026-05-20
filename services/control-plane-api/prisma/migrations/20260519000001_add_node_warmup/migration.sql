-- Migration: add_node_warmup (§24 Node Assignment Engine)
-- Adds warmup tracking fields to nodes table

CREATE TYPE "WarmupStatus" AS ENUM ('COLD', 'WARMING', 'WARM');

ALTER TABLE "nodes" ADD COLUMN "warmupStatus" "WarmupStatus" NOT NULL DEFAULT 'COLD';
ALTER TABLE "nodes" ADD COLUMN "warmupEndsAt" TIMESTAMPTZ;
