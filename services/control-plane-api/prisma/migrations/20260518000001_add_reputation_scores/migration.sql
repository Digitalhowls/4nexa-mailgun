-- Migration: add_reputation_scores (§7 Reputation Engine)
-- Adds trustScore to tenants and healthScore to domains

ALTER TABLE "tenants" ADD COLUMN "trustScore" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "domains"  ADD COLUMN "healthScore" INTEGER NOT NULL DEFAULT 100;
