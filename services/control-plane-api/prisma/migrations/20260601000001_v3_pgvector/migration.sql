-- Migration v3: pgvector extension + MemoryCell embedding
-- Requiere PostgreSQL 16 con extensión vector instalada

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "MemoryCell"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS idx_memory_cell_embedding ON "MemoryCell" USING ivfflat ("embedding" vector_cosine_ops);
