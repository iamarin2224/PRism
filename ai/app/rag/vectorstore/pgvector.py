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

    async def insert_chunks(self, chunks: List[CodeChunk]) -> int:
        """Batch inserts code chunks and their embeddings into the code_chunks table."""
        if not chunks:
            return 0

        pool = await get_db_pool()
        async with pool.acquire() as conn:
            records = []
            for c in chunks:
                if c.embedding is None:
                    continue
                # Convert list of floats to numpy array for pgvector
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

            # Batch insert using asyncpg executemany with generated UUIDs and timestamps
            query = """
                INSERT INTO code_chunks (
                    id, repo_name, commit_sha, file_path, language,
                    start_line, end_line, symbol, content, token_count, embedding, created_at
                ) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());
            """
            await conn.executemany(query, records)
            logger.info(f"Inserted {len(records)} code chunks into pgvector store.")
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

    async def delete_all_repo_chunks(self, repo_name: str) -> int:
        """Deletes all chunks for a repository (for full re-indexing)."""
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
