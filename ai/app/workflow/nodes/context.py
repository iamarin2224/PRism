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
    1. Context Construction Node:
    Aggregates Semantic Memory (RAG), Procedural Memory (.prism/rules),
    and Episodic Memory (historical feedback) before specialist fan-out.
    Mandatory grounding ensuring no specialist runs blind.
    """
    start_time = time.perf_counter()
    repo_name = state["repo_name"]
    pr_num = state["pr_number"]
    logger.info(f"[{state['review_run_id']}] Building Tri-Partite context for {repo_name} PR #{pr_num}")

    # 1. Derive search query from PR title, body, and diff summary
    pr_title = state.get("pr_metadata", {}).get("title", "")
    pr_body = state.get("pr_metadata", {}).get("body", "")
    search_query = f"{pr_title} {pr_body}".strip() or "pull request changes"

    # 2. Semantic Memory: Code-aware RAG over codebase outside diff
    semantic_chunks = []
    try:
        retrieval_res = await code_retriever.retrieve(
            repo_name=repo_name,
            query=search_query,
            top_k=5,
        )
        semantic_chunks = [c.model_dump() for c in retrieval_res.chunks]
    except Exception as e:
        logger.warning(f"[{state['review_run_id']}] Semantic memory retrieval fallback: {e}")

    # 3. Procedural Memory: Load repo-specific rules or built-in standards
    procedural_rules = load_procedural_rules(
        repo_name=repo_name,
        repo_files=state.get("diff_summary", {}).get("files_content"),
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
            "semantic_chunks_count": len(semantic_chunks),
            "procedural_rules_count": len(procedural_rules),
            "episodic_feedback_count": len(episodic_feedback),
        },
        duration_ms=duration_ms,
    )

    return {
        "status": "IN_PROGRESS",
        "semantic_context": semantic_chunks,
        "procedural_rules": procedural_rules,
        "episodic_context": episodic_feedback,
    }
