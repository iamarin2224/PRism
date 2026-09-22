import logging
import time
from typing import Any, Dict

from app.rag import code_retriever
from app.workflow.events import events_spine
from app.workflow.memory import (
    episodic_memory_service,
    load_procedural_rules,
)
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.context")


async def build_context_node(state: ReviewState) -> Dict[str, Any]:
    """
    Context Construction Node:
    Aggregates Semantic Memory (Current PR Semantics + Code-aware RAG repository context),
    Procedural Memory (.prism/rules & engineering standards), and Episodic Memory
    (historical human feedback) before parallel specialist fan-out.
    Enforces the strict tri-partite memory model where the PR change is part of Semantic Memory.
    """
    start_time = time.perf_counter()
    repo_name = state["repo_name"]
    pr_num = state["pr_number"]
    logger.info(f"[{state['review_run_id']}] Building Tri-Partite context for {repo_name} PR #{pr_num}")

    pr_metadata = state.get("pr_metadata") or {}
    pr_title = pr_metadata.get("title", "")
    pr_body = pr_metadata.get("body", "")
    diff_summary = state.get("diff_summary") or {}
    files_content: Dict[str, Any] = diff_summary.get("files_content", {})

    # 1. Derive rich, bounded search query from PR title, body, file paths, and key changed tokens
    query_parts = []
    if pr_title:
        query_parts.append(pr_title)
    if pr_body:
        # Include first 300 chars of body to avoid runaway prompt explosion
        query_parts.append(pr_body[:300].strip())

    changed_file_paths = list(files_content.keys())
    if changed_file_paths:
        query_parts.append(" ".join(changed_file_paths[:10]))

    # Extract sample modified lines or keywords from diff
    sample_diff_tokens = []
    for fpath, content in list(files_content.items())[:5]:
        if isinstance(content, str):
            for line in content.splitlines()[:15]:
                clean_line = line.strip()
                if clean_line.startswith(("+", "-", "def ", "class ", "export ", "function ", "import ")):
                    sample_diff_tokens.append(clean_line.lstrip("+- ").strip())
    if sample_diff_tokens:
        query_parts.append(" ".join(sample_diff_tokens[:10]))

    search_query = " ".join(query_parts).strip()
    # Bound total query length for vector embeddings safely
    if len(search_query) > 1000:
        search_query = search_query[:1000]

    # 2. Semantic Memory: Only query pgvector RAG if there is meaningful search text
    retrieved_chunks = []
    if search_query:
        try:
            retrieval_res = await code_retriever.retrieve(
                repo_name=repo_name,
                query=search_query,
                top_k=5,
            )
            for chunk in retrieval_res.chunks:
                retrieved_chunks.append({
                    "source": "repository_rag",
                    "id": chunk.id,
                    "repo_name": chunk.repo_name,
                    "file_path": chunk.file_path,
                    "language": chunk.language,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "content": chunk.content,
                    "similarity": chunk.similarity,
                })
        except Exception as e:
            logger.warning(f"[{state['review_run_id']}] Semantic memory repository retrieval fallback: {e}")

    # Format current PR semantics with provenance
    pr_changed_files_list = []
    for fpath, fcontent in files_content.items():
        pr_changed_files_list.append({
            "source": "pr_diff",
            "file_path": fpath,
            "content": fcontent,
        })

    semantic_context = {
        "pr": {
            "source": "pr_metadata",
            "title": pr_title,
            "body": pr_body,
            "repo_name": repo_name,
            "pr_number": pr_num,
            "commit_sha": state.get("commit_sha", ""),
            "base_sha": state.get("base_sha", "main"),
            "changed_files_count": len(changed_file_paths),
            "changed_files": changed_file_paths,
            "changes": pr_changed_files_list,
        },
        "repository": {
            "source": "pgvector_rag",
            "retrieved_chunks": retrieved_chunks,
        },
    }

    # 3. Procedural Memory: Load repo-specific rules or built-in standards
    procedural_rules = load_procedural_rules(
        repo_name=repo_name,
        repo_files=files_content,
    )

    # 4. Episodic Memory: Query historical feedback for similar code patterns
    episodic_feedback = []
    try:
        episodic_feedback = await episodic_memory_service.query_episodic_memory(
            repo_name=repo_name,
            query=search_query,
            top_k=5,
        )
    except Exception as e:
        logger.warning(f"[{state['review_run_id']}] Episodic memory retrieval fallback: {e}")

    duration_ms = (time.perf_counter() - start_time) * 1000
    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="build_context",
        event_type="CONTEXT_BUILT",
        payload={
            "pr_changed_files_count": len(changed_file_paths),
            "semantic_chunks_count": len(retrieved_chunks),
            "procedural_rules_count": len(procedural_rules),
            "episodic_feedback_count": len(episodic_feedback),
        },
        duration_ms=duration_ms,
    )

    return {
        "status": "IN_PROGRESS",
        "semantic_context": semantic_context,
        "procedural_rules": procedural_rules,
        "episodic_context": episodic_feedback,
    }
