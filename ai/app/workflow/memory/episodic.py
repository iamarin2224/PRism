import hashlib
import json
import logging
from typing import Any, Dict, List, Optional
import numpy as np

from app.config import settings
from app.rag.db import get_db_pool
from app.rag.embeddings.client import embedding_service

logger = logging.getLogger("prism.workflow.memory.episodic")


class EpisodicMemoryService:
    """
    Episodic Memory Subsystem:
    Stores and retrieves historical human PR review feedback, accepted findings,
    and dismissed false positives via Neon PostgreSQL and pgvector.
    """

    @staticmethod
    def compute_finding_hash(file_path: str, title: str) -> str:
        """Computes a deterministic hash for a finding."""
        raw = f"{file_path.strip().lower()}:{title.strip().lower()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def query_episodic_memory(
        self, repo_name: str, query: str, top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Query historical human feedback relevant to the current review context.
        Strictly repository-scoped using pgvector cosine distance.
        """
        if not settings.DATABASE_URL or not query.strip():
            return []

        try:
            # Generate query embedding vector
            query_vector = embedding_service.embed_query(query)
            vector_str = "[" + ",".join(str(x) for x in query_vector) + "]"

            pool = await get_db_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT id, repo_name, pr_number, finding_hash, feedback_type, file_path, title, comment,
                           1 - (embedding <=> $1::vector) AS similarity
                    FROM episodic_memory
                    WHERE repo_name = $2
                    ORDER BY embedding <=> $1::vector ASC
                    LIMIT $3;
                    """,
                    vector_str,
                    repo_name,
                    top_k,
                )

                results: List[Dict[str, Any]] = []
                for row in rows:
                    results.append({
                        "id": row["id"],
                        "repo_name": row["repo_name"],
                        "pr_number": row["pr_number"],
                        "feedback_type": row["feedback_type"],
                        "file_path": row["file_path"],
                        "title": row["title"],
                        "comment": row["comment"] or "",
                        "similarity": float(row["similarity"]) if row["similarity"] is not None else 0.0,
                    })
                return results

        except Exception as e:
            logger.warning(f"Episodic memory query error for {repo_name}: {e}")
            return []

    async def record_episodic_feedback(
        self,
        repo_name: str,
        pr_number: int,
        finding_title: str,
        file_path: str,
        feedback_type: str,
        comment: Optional[str] = None,
    ) -> Optional[str]:
        """
        Record a developer's acceptance or dismissal of a finding into episodic memory.
        """
        if not settings.DATABASE_URL:
            logger.warning("DATABASE_URL not set; skipping episodic feedback persistence.")
            return None

        try:
            finding_hash = self.compute_finding_hash(file_path, finding_title)
            embed_text = f"{file_path} {finding_title} {comment or ''}".strip()
            vector = embedding_service.embed_query(embed_text)
            vector_str = "[" + ",".join(str(x) for x in vector) + "]"

            pool = await get_db_pool()
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO episodic_memory (repo_name, pr_number, finding_hash, feedback_type, file_path, title, comment, embedding)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
                    RETURNING id;
                    """,
                    repo_name,
                    pr_number,
                    finding_hash,
                    feedback_type.upper(),
                    file_path,
                    finding_title,
                    comment,
                    vector_str,
                )
                memory_id = row["id"] if row else None
                logger.info(f"Recorded episodic feedback '{memory_id}' for {repo_name} PR #{pr_number}")
                return memory_id
        except Exception as e:
            logger.error(f"Failed to record episodic feedback: {e}")
            return None


# Global episodic memory service singleton
episodic_memory_service = EpisodicMemoryService()
