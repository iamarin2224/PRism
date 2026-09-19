-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('NOT_INDEXED', 'INDEXING', 'INDEXED', 'STALE', 'FAILED');

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "installation_id" BIGINT,
    "indexed_commit" TEXT,
    "current_commit" TEXT,
    "index_status" "IndexStatus" NOT NULL DEFAULT 'NOT_INDEXED',
    "error_message" TEXT,
    "last_indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_chunks" (
    "id" TEXT NOT NULL,
    "repo_name" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "symbol" TEXT,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector(1536),

    CONSTRAINT "code_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_full_name_key" ON "repositories"("full_name");

-- CreateIndex
CREATE INDEX "code_chunks_repo_file_idx" ON "code_chunks"("repo_name", "file_path");

-- CreateIndex
CREATE INDEX "code_chunks_repo_commit_idx" ON "code_chunks"("repo_name", "commit_sha");

-- Create HNSW index for fast approximate cosine similarity search
CREATE INDEX IF NOT EXISTS code_chunks_embedding_hnsw_idx 
ON "code_chunks" 
USING hnsw (embedding vector_cosine_ops);