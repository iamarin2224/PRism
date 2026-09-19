import asyncio
import datetime
import logging
from typing import Dict, List, Optional, Set

from app.config import settings
from app.rag.chunking.splitter import code_splitter
from app.rag.db import get_db_pool
from app.rag.embeddings.client import embedding_service
from app.rag.ingestion.github import IngestedFile, ingestion_service
from app.rag.models import (
    CodeChunk,
    IndexingRequest,
    IndexingResponse,
    IndexStatus,
    RepoIndexState,
)
from app.rag.vectorstore.pgvector import vector_store


logger = logging.getLogger("prism.rag.indexing")

# In-memory lock set to prevent duplicate concurrent indexing operations for the same repo
_active_indexing_jobs: Set[str] = set()


class IndexingPipeline:
    """
    Coordinates full and incremental repository indexing,
    state persistence in Neon PostgreSQL, and concurrency locking.
    """

    async def get_or_create_repo_record(
        self,
        repo_name: str,
        installation_id: Optional[int] = None,
    ) -> RepoIndexState:
        """Retrieves or creates the repository record in the repositories table."""
        pool = await get_db_pool()
        owner, _, name = repo_name.partition("/")
        if not name:
            owner, name = "unknown", repo_name

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM repositories WHERE full_name = $1;",
                repo_name,
            )
            if not row:
                return RepoIndexState(
                    repo_name=repo_name,
                    status=IndexStatus.NOT_INDEXED,
                    indexed_commit=None,
                    current_commit=None,
                    last_indexed_at=None,
                    error_message=None,
                    total_chunks=0,
                )

            chunk_count = await vector_store.get_chunk_count(repo_name)
            last_idx = row["last_indexed_at"].isoformat() if row["last_indexed_at"] else None

            return RepoIndexState(
                repo_name=row["full_name"],
                status=IndexStatus(row["index_status"]),
                indexed_commit=row["indexed_commit"],
                current_commit=row["current_commit"],
                last_indexed_at=last_idx,
                error_message=row["error_message"],
                total_chunks=chunk_count,
            )

    async def list_all_repos(self) -> List[RepoIndexState]:
        """Lists all tracked repositories in the database with their current index status."""
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM repositories WHERE index_status != 'NOT_INDEXED' ORDER BY updated_at DESC LIMIT 50;")
            results: List[RepoIndexState] = []
            for row in rows:
                repo_name = row["full_name"]
                chunk_count = await vector_store.get_chunk_count(repo_name)
                last_idx = row["last_indexed_at"].isoformat() if row["last_indexed_at"] else None
                results.append(
                    RepoIndexState(
                        repo_name=repo_name,
                        status=IndexStatus(row["index_status"]),
                        indexed_commit=row["indexed_commit"],
                        current_commit=row["current_commit"],
                        last_indexed_at=last_idx,
                        error_message=row["error_message"],
                        total_chunks=chunk_count,
                    )
                )
            return results

    async def update_repo_status(
        self,
        repo_name: str,
        status: IndexStatus,
        indexed_commit: Optional[str] = None,
        current_commit: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Updates repository index metadata and status in database (upserting if not present)."""
        pool = await get_db_pool()
        owner, _, name = repo_name.partition("/")
        if not name:
            owner, name = "unknown", repo_name

        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO repositories (
                    id, full_name, owner, name, index_status, indexed_commit, current_commit, error_message, last_indexed_at, created_at, updated_at
                ) VALUES (
                    gen_random_uuid()::text, $1, $2, $3, $4::"IndexStatus", $5, $6, $7,
                    CASE WHEN $4::text = 'INDEXED' THEN NOW() ELSE NULL END, NOW(), NOW()
                )
                ON CONFLICT (full_name) DO UPDATE
                SET index_status = $4::"IndexStatus",
                    indexed_commit = COALESCE($5, repositories.indexed_commit),
                    current_commit = COALESCE($6, repositories.current_commit),
                    error_message = $7,
                    last_indexed_at = CASE WHEN $4::text = 'INDEXED' THEN NOW() ELSE repositories.last_indexed_at END,
                    updated_at = NOW();
                """,
                repo_name,
                owner,
                name,
                status.value,
                indexed_commit,
                current_commit,
                error_message,
            )



    async def remove_repository(self, repo_name: str) -> bool:
        """Removes a repository and its vector chunks from the database."""
        pool = await get_db_pool()
        await vector_store.delete_all_repo_chunks(repo_name)
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM repositories WHERE full_name = $1;", repo_name)
        return True

    async def mark_push_event(self, repo_name: str, new_head_sha: str) -> RepoIndexState:
        """
        Handles GitHub push events: updates current_commit and marks status STALE
        if new_head_sha differs from indexed_commit.
        NOTE: Webhook does NOT perform heavy indexing.
        """
        state = await self.get_or_create_repo_record(repo_name)
        new_status = state.status

        if state.indexed_commit and state.indexed_commit != new_head_sha:
            new_status = IndexStatus.STALE
            logger.info(f"Marked {repo_name} as STALE (indexed: {state.indexed_commit[:7]}, new: {new_head_sha[:7]})")

        await self.update_repo_status(
            repo_name=repo_name,
            status=new_status,
            current_commit=new_head_sha,
        )
        return await self.get_or_create_repo_record(repo_name)

    async def schedule_indexing(
        self,
        request: IndexingRequest,
        raw_files: Optional[List[dict]] = None,
    ) -> IndexingResponse:
        """
        Schedules a background indexing job. Prevents duplicate concurrent indexing
        runs on the same repository.
        """
        repo_name = request.repo_name

        if repo_name in _active_indexing_jobs:
            return IndexingResponse(
                repo_name=repo_name,
                status=IndexStatus.INDEXING,
                message="An indexing job is already in progress for this repository.",
            )

        # Initialize repository record if needed
        state = await self.get_or_create_repo_record(repo_name, request.installation_id)
        target_commit = request.commit_sha or state.current_commit or "main"

        # Resolve token: prioritize request token, fallback to environment GITHUB_TOKEN
        token = request.github_token or settings.GITHUB_TOKEN or None

        # Mark in-memory lock and launch background task
        _active_indexing_jobs.add(repo_name)
        asyncio.create_task(
            self._execute_indexing_job(
                repo_name=repo_name,
                target_commit=target_commit,
                force_full=request.force_full,
                github_token=token,
                raw_files=raw_files,
            )
        )


        return IndexingResponse(
            repo_name=repo_name,
            status=IndexStatus.INDEXING,
            message="Repository indexing scheduled successfully in background.",
            commit_sha=target_commit,
        )

    async def _execute_indexing_job(
        self,
        repo_name: str,
        target_commit: str,
        force_full: bool = False,
        github_token: Optional[str] = None,
        raw_files: Optional[List[dict]] = None,
        changed_files_map: Optional[Dict[str, List[str]]] = None,
    ) -> None:
        """Background execution worker for repository indexing."""
        try:
            logger.info(f"Starting indexing for {repo_name} at commit {target_commit} (force_full={force_full})")
            await self.update_repo_status(repo_name, IndexStatus.INDEXING)

            state = await self.get_or_create_repo_record(repo_name)
            is_incremental = (
                not force_full
                and state.indexed_commit is not None
                and state.indexed_commit != target_commit
                and changed_files_map is not None
            )

            if is_incremental and changed_files_map:
                await self._run_incremental_indexing(repo_name, target_commit, changed_files_map, raw_files or [])
            else:
                await self._run_full_indexing(repo_name, target_commit, github_token, raw_files)

            await self.update_repo_status(
                repo_name=repo_name,
                status=IndexStatus.INDEXED,
                indexed_commit=target_commit,
                current_commit=target_commit,
                error_message=None,
            )
            logger.info(f"Indexing completed successfully for {repo_name} at commit {target_commit}")
        except Exception as e:
            logger.error(f"Indexing failed for {repo_name}: {e}", exc_info=True)
            await self.update_repo_status(
                repo_name=repo_name,
                status=IndexStatus.FAILED,
                error_message=str(e),
            )
        finally:
            _active_indexing_jobs.discard(repo_name)

    async def _run_full_indexing(
        self,
        repo_name: str,
        commit_sha: str,
        github_token: Optional[str] = None,
        raw_files: Optional[List[dict]] = None,
    ) -> None:
        """Performs a full clean index of the repository."""
        # 1. Ingest files
        if raw_files is not None:
            files = ingestion_service.filter_local_files(raw_files)
        else:
            files = await ingestion_service.fetch_repository_files_github(repo_name, commit_sha, token=github_token)


        if not files:
            logger.warning(f"No indexable files found for {repo_name}")
            await vector_store.delete_all_repo_chunks(repo_name)
            return

        # 2. Language-aware code splitting
        all_chunks: List[CodeChunk] = []
        for f in files:
            chunks = code_splitter.split_file(
                file_path=f.path,
                content=f.content,
                repo_name=repo_name,
                commit_sha=commit_sha,
            )
            all_chunks.extend(chunks)

        if not all_chunks:
            logger.warning(f"No chunks produced for {repo_name}")
            await vector_store.delete_all_repo_chunks(repo_name)
            return

        # 3. Generate embeddings via AICredits in batches
        texts_to_embed = [c.content for c in all_chunks]
        embeddings = embedding_service.embed_texts(texts_to_embed)

        for chunk, emb in zip(all_chunks, embeddings):
            chunk.embedding = emb

        # 4. Atomically delete old repo chunks and insert new chunks into pgvector
        await vector_store.delete_all_repo_chunks(repo_name)
        await vector_store.insert_chunks(all_chunks)

    async def _run_incremental_indexing(
        self,
        repo_name: str,
        commit_sha: str,
        changed_files_map: Dict[str, List[str]],
        raw_files: List[dict],
    ) -> None:
        """
        Incrementally updates index by removing chunks of modified/deleted files
        and embedding only added/modified files.
        """
        modified = changed_files_map.get("modified", [])
        deleted = changed_files_map.get("deleted", [])
        added = changed_files_map.get("added", [])

        # 1. Delete stale chunks for modified and deleted files
        files_to_remove = list(set(modified + deleted))
        if files_to_remove:
            await vector_store.delete_chunks_by_files(repo_name, files_to_remove)

        # 2. Filter added and modified files
        files_to_index_paths = set(added + modified)
        changed_raw_files = [f for f in raw_files if f.get("path") in files_to_index_paths]
        files = ingestion_service.filter_local_files(changed_raw_files)

        if not files:
            return

        # 3. Chunk and embed changed files
        new_chunks: List[CodeChunk] = []
        for f in files:
            chunks = code_splitter.split_file(
                file_path=f.path,
                content=f.content,
                repo_name=repo_name,
                commit_sha=commit_sha,
            )
            new_chunks.extend(chunks)

        if new_chunks:
            texts_to_embed = [c.content for c in new_chunks]
            embeddings = embedding_service.embed_texts(texts_to_embed)

            for chunk, emb in zip(new_chunks, embeddings):
                chunk.embedding = emb

            await vector_store.insert_chunks(new_chunks)


# Global indexing pipeline singleton
indexing_pipeline = IndexingPipeline()
