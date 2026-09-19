import logging
import time
from typing import List, Optional
import numpy as np

from app.rag.db import get_db_pool
from app.rag.models import CodeChunk, RetrievedChunk, RetrievalResult

logger = logging.getLogger("prism.rag.vectorstore")


class PgVectorStore:
    """
    Vector store manager interacting directly with PostgreSQL + pgvector via asyncpg.
    Enforces strict repository scoping (WHERE repo_name = :repo_name) on all queries.
    """

    async def insert_chunks(self, chunks: List[CodeChunk], batch_size: int = 250) -> int:
        """Batch inserts code chunks and their embeddings into the code_chunks table in chunks of batch_size."""
        if not chunks:
            return 0

        pool = await get_db_pool()
        records = []
        for c in chunks:
            if c.embedding is None:
                continue
            vec = np.array(c.embedding, dtype=np.float32)
            records.append(
                (
                    c.repo_name,
                    c.commit_sha,
                    c.file_path,
                    c.language,
                    c.start_line,
                    c.end_line,
                    c.symbol,
                    c.content,
                    c.token_count,
                    vec,
                )
            )

        if not records:
            return 0

        query = """
            INSERT INTO code_chunks (
                id, repo_name, commit_sha, file_path, language,
                start_line, end_line, symbol, content, token_count, embedding, created_at
            ) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());
        """

        async with pool.acquire() as conn:
            # Batch executemany in fixed chunks to prevent memory/buffer exhaustion
            for i in range(0, len(records), batch_size):
                batch = records[i : i + batch_size]
                await conn.executemany(query, batch)

        logger.info(f"Inserted {len(records)} code chunks into pgvector store in batches of {batch_size}.")
        return len(records)


    async def delete_chunks_by_files(self, repo_name: str, file_paths: List[str]) -> int:
        """Deletes chunks belonging to specific files in a repository (for incremental indexing)."""
        if not file_paths:
            return 0

        pool = await get_db_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM code_chunks
                WHERE repo_name = $1 AND file_path = ANY($2::text[]);
                """,
                repo_name,
                file_paths,
            )
            count = int(result.split()[-1]) if result else 0
            logger.info(f"Deleted {count} stale chunks for {len(file_paths)} files in {repo_name}.")
            return count

    async def replace_all_chunks(self, repo_name: str, chunks: List[CodeChunk], batch_size: int = 250) -> int:
        """
        Atomically replaces all code chunks for a repository within a single database transaction,
        inserting in batches of batch_size. If chunk insertion fails, old chunks are NOT lost.
        """
        records = []
        for c in chunks:
            if c.embedding is None:
                continue
            vec = np.array(c.embedding, dtype=np.float32)
            records.append(
                (
                    c.repo_name,
                    c.commit_sha,
                    c.file_path,
                    c.language,
                    c.start_line,
                    c.end_line,
                    c.symbol,
                    c.content,
                    c.token_count,
                    vec,
                )
            )

        pool = await get_db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Delete old chunks inside transaction
                await conn.execute("DELETE FROM code_chunks WHERE repo_name = $1;", repo_name)

                # 2. Insert new chunks inside same transaction in batches
                if records:
                    query = """
                        INSERT INTO code_chunks (
                            id, repo_name, commit_sha, file_path, language,
                            start_line, end_line, symbol, content, token_count, embedding, created_at
                        ) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());
                    """
                    for i in range(0, len(records), batch_size):
                        batch = records[i : i + batch_size]
                        await conn.executemany(query, batch)

            logger.info(f"Atomically replaced chunks for {repo_name}: {len(records)} new chunks inserted in batches of {batch_size}.")
            return len(records)

    async def delete_all_repo_chunks(self, repo_name: str) -> int:
        """Deletes all chunks for a repository (for full re-indexing or repo removal)."""
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM code_chunks WHERE repo_name = $1;",
                repo_name,
            )
            count = int(result.split()[-1]) if result else 0
            logger.info(f"Deleted all {count} chunks for {repo_name}.")
            return count

    async def similarity_search(
        self,
        query: str,
        query_vector: List[float],
        repo_name: str,
        top_k: int = 5,
        file_path_filter: Optional[str] = None,
    ) -> RetrievalResult:
        """
        Executes an HNSW-accelerated cosine distance similarity search strictly scoped
        to the target repository (WHERE repo_name = :repo_name).
        """
        start_time = time.perf_counter()
        pool = await get_db_pool()
        vec = np.array(query_vector, dtype=np.float32)

        async with pool.acquire() as conn:
            # Cosine similarity is: 1 - (embedding <=> query_vector)
            sql = """
                SELECT id, repo_name, file_path, language, start_line, end_line, symbol, content,
                       1 - (embedding <=> $1) AS similarity
                FROM code_chunks
                WHERE repo_name = $2
                  AND ($4::text IS NULL OR file_path = $4)
                ORDER BY embedding <=> $1 ASC
                LIMIT $3;
            """
            rows = await conn.fetch(sql, vec, repo_name, top_k, file_path_filter)

            chunks: List[RetrievedChunk] = []
            for row in rows:
                chunks.append(
                    RetrievedChunk(
                        id=str(row["id"]),
                        repo_name=row["repo_name"],
                        file_path=row["file_path"],
                        language=row["language"],
                        start_line=row["start_line"],
                        end_line=row["end_line"],
                        symbol=row["symbol"],
                        content=row["content"],
                        similarity=float(row["similarity"]),
                    )
                )

        latency_ms = (time.perf_counter() - start_time) * 1000
        return RetrievalResult(
            query=query,
            repo_name=repo_name,
            chunks=chunks,
            top_k=top_k,
            latency_ms=round(latency_ms, 2),
        )

    async def exact_text_search(
        self,
        query: str,
        repo_name: str,
        limit: int = 20,
        file_path_filter: Optional[str] = None,
    ) -> List[dict]:
        """
        Executes a deterministic textual search (ILIKE) on indexed code chunks in PostgreSQL.
        """
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            sql = """
                SELECT id, repo_name, file_path, language, start_line, end_line, symbol, content
                FROM code_chunks
                WHERE repo_name = $1
                  AND content ILIKE $2
                  AND ($4::text IS NULL OR file_path = $4)
                ORDER BY file_path ASC, start_line ASC
                LIMIT $3;
            """
            rows = await conn.fetch(sql, repo_name, f"%{query}%", limit, file_path_filter)
            return [
                {
                    "id": str(r["id"]),
                    "repo_name": r["repo_name"],
                    "file_path": r["file_path"],
                    "language": r["language"],
                    "start_line": r["start_line"],
                    "end_line": r["end_line"],
                    "symbol": r["symbol"],
                    "content": r["content"],
                }
                for r in rows
            ]

    async def find_symbol_references(
        self,
        symbol: str,
        repo_name: str,
        limit: int = 30,
    ) -> List[dict]:
        """
        Searches for definitions and references to a symbol within indexed code chunks.
        """
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Matches exact symbol definition column OR symbol pattern in content
            sql = """
                SELECT id, repo_name, file_path, language, start_line, end_line, symbol, content,
                       CASE 
                           WHEN symbol = $1 THEN 'definition'
                           WHEN content ILIKE ('%import%' || $1 || '%') OR content ILIKE ('%from%' || $1 || '%') THEN 'import'
                           ELSE 'reference'
                       END AS reference_type
                FROM code_chunks
                WHERE repo_name = $2
                  AND (symbol = $1 OR content ~ ('\\m' || $3 || '\\M'))
                ORDER BY 
                    CASE WHEN symbol = $1 THEN 0 ELSE 1 END,
                    file_path ASC, start_line ASC
                LIMIT $4;
            """
            # Escape regex special characters in symbol
            import re
            escaped_symbol = re.escape(symbol)
            rows = await conn.fetch(sql, symbol, repo_name, escaped_symbol, limit)
            return [
                {
                    "id": str(r["id"]),
                    "repo_name": r["repo_name"],
                    "file_path": r["file_path"],
                    "language": r["language"],
                    "start_line": r["start_line"],
                    "end_line": r["end_line"],
                    "symbol": r["symbol"],
                    "content": r["content"],
                    "reference_type": r["reference_type"],
                }
                for r in rows
            ]

    async def get_chunk_count(self, repo_name: str) -> int:
        """Returns the total number of indexed chunks for a repository."""
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval(
                "SELECT COUNT(*) FROM code_chunks WHERE repo_name = $1;",
                repo_name,
            )
            return val or 0


# Global pgvector store singleton
vector_store = PgVectorStore()
