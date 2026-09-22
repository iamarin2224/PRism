import asyncio
import logging
from typing import AsyncGenerator, Optional
import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings

logger = logging.getLogger("prism.rag.db")

_pool: Optional[asyncpg.Pool] = None


async def get_db_pool() -> asyncpg.Pool:
    """Get or initialize the asyncpg connection pool connected to Neon PostgreSQL."""
    global _pool
    if _pool is None:
        if not settings.DATABASE_URL:
            raise ValueError("DATABASE_URL is not configured in settings.")
        
        async def init_conn(conn):
            await register_vector(conn)
            # Tune HNSW vector search recall on filtered/multi-tenant queries
            try:
                await conn.execute("SET hnsw.ef_search = 60;")
            except Exception:
                pass
            try:
                await conn.execute("SET hnsw.iterative_scan = 'relaxed_order';")
            except Exception:
                pass

        # Create connection pool
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=1,
            max_size=10,
            init=init_conn,
            command_timeout=60,
        )
        logger.info("Initialized asyncpg database connection pool with tuned HNSW parameters.")
    return _pool


async def init_db() -> None:
    """
    Ensures pgvector extension, repositories table, code_chunks table,
    and HNSW vector index with vector_cosine_ops are created.
    """
    if not settings.DATABASE_URL:
        logger.warning("DATABASE_URL is not set. Skipping database schema initialization.")
        return

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Enable pgvector and uuid extensions
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        await conn.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

        # Create repositories table if it doesn't exist
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS repositories (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                full_name TEXT UNIQUE NOT NULL,
                owner TEXT NOT NULL,
                name TEXT NOT NULL,
                default_branch TEXT NOT NULL DEFAULT 'main',
                installation_id BIGINT,
                indexed_commit TEXT,
                current_commit TEXT,
                index_status TEXT NOT NULL DEFAULT 'NOT_INDEXED',
                error_message TEXT,
                last_indexed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Create code_chunks table with pgvector column (1536 dims)
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS code_chunks (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                repo_name TEXT NOT NULL,
                commit_sha TEXT NOT NULL,
                file_path TEXT NOT NULL,
                language TEXT NOT NULL,
                start_line INT NOT NULL,
                end_line INT NOT NULL,
                symbol TEXT,
                content TEXT NOT NULL,
                token_count INT NOT NULL,
                embedding vector({settings.EMBEDDING_DIMENSION}),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Create B-Tree indexes for efficient repo/file/commit scoping
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS code_chunks_repo_file_idx ON code_chunks (repo_name, file_path);
            CREATE INDEX IF NOT EXISTS code_chunks_repo_commit_idx ON code_chunks (repo_name, commit_sha);
            CREATE INDEX IF NOT EXISTS repositories_full_name_idx ON repositories (full_name);
        """)

        # Create episodic_memory table for historical human feedback
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                repo_name TEXT NOT NULL,
                pr_number INT NOT NULL,
                finding_hash TEXT NOT NULL,
                feedback_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                title TEXT NOT NULL,
                comment TEXT,
                embedding vector({settings.EMBEDDING_DIMENSION}),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS episodic_memory_repo_file_idx ON episodic_memory (repo_name, file_path);
            CREATE INDEX IF NOT EXISTS episodic_memory_hash_idx ON episodic_memory (finding_hash);
        """)

        logger.info("Database schema and HNSW vector indexes verified.")


async def close_db_pool() -> None:
    """Closes the asyncpg connection pool cleanly on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Closed asyncpg database connection pool.")
