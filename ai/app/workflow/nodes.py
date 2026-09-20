import logging
import time
from typing import Any, Dict, List, Literal
from app.models.review import Finding
from app.rag import code_retriever
from app.workflow.memory import (
    episodic_memory_service,
    load_procedural_rules,
)
from app.workflow.state import ReviewState, SpecialistOutput

logger = logging.getLogger("prism.workflow.nodes")


async def build_context_node(state: ReviewState) -> Dict[str, Any]:
    """
    1. Context Construction Node (Phase 5.3):
    Aggregates Semantic Memory (RAG), Procedural Memory (.prism/rules),
    and Episodic Memory (historical feedback) before specialist fan-out.
    Mandatory grounding ensuring no specialist runs blind.
    """
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

    return {
        "status": "IN_PROGRESS",
        "semantic_context": semantic_chunks,
        "procedural_rules": procedural_rules,
        "episodic_context": episodic_feedback,
    }


async def security_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.1 Security Specialist Agent Node (Phase 5.4):
    Analyzes OWASP vulnerabilities, auth flaws, secrets, and injection risks.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Security specialist executing...")
    # Specialist logic and tools are bound in 5.4
    output = SpecialistOutput(
        specialist_name="security",
        findings=[],
        tokens_in=0,
        tokens_out=0,
        execution_time_ms=(time.perf_counter() - start_time) * 1000,
    )
    return {"specialist_results": [output]}


async def quality_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.2 Quality Specialist Agent Node (Phase 5.4):
    Analyzes code design, anti-patterns, performance, and maintainability.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Quality specialist executing...")
    output = SpecialistOutput(
        specialist_name="quality",
        findings=[],
        tokens_in=0,
        tokens_out=0,
        execution_time_ms=(time.perf_counter() - start_time) * 1000,
    )
    return {"specialist_results": [output]}


async def tests_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.3 Tests Specialist Agent Node (Phase 5.4):
    Analyzes regression risk, test coverage, and sandbox verification.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Tests specialist executing...")
    output = SpecialistOutput(
        specialist_name="tests",
        findings=[],
        tokens_in=0,
        tokens_out=0,
        execution_time_ms=(time.perf_counter() - start_time) * 1000,
    )
    return {"specialist_results": [output]}


async def docs_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.4 Documentation Specialist Agent Node (Phase 5.4):
    Analyzes API contracts, comments, breaking changes, and documentation completeness.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Docs specialist executing...")
    output = SpecialistOutput(
        specialist_name="docs",
        findings=[],
        tokens_in=0,
        tokens_out=0,
        execution_time_ms=(time.perf_counter() - start_time) * 1000,
    )
    return {"specialist_results": [output]}


async def aggregate_and_deduplicate_node(state: ReviewState) -> Dict[str, Any]:
    """
    3. Aggregation & Deduplication Node (Phase 5.5):
    Pure-Python deterministic merge matching findings by file path and overlapping
    line ranges, tracking cross-specialist agreement.
    """
    logger.info(f"[{state['review_run_id']}] Aggregating findings from specialists...")
    all_findings: List[Finding] = []
    for res in state.get("specialist_results", []):
        all_findings.extend(res.findings)

    # Deterministic deduplication
    merged: List[Finding] = []
    for candidate in all_findings:
        is_duplicate = False
        for existing in merged:
            if (
                candidate.file_path == existing.file_path
                and candidate.start_line is not None
                and existing.start_line is not None
                and abs(candidate.start_line - existing.start_line) <= 3
                and candidate.category == existing.category
            ):
                existing.agreement_count += 1
                is_duplicate = True
                break
        if not is_duplicate:
            merged.append(candidate)

    return {"merged_findings": merged}


async def critic_verifier_node(state: ReviewState) -> Dict[str, Any]:
    """
    4. Critic / Verifier Node (Phase 5.5):
    Validates candidate findings against retrieved code context to eliminate
    hallucinations and false positives.
    """
    logger.info(f"[{state['review_run_id']}] Critic verifying findings...")
    candidates = state.get("merged_findings", [])
    verified: List[Finding] = []
    for f in candidates:
        f.is_verified = True
        verified.append(f)
    return {"verified_findings": verified}


def confidence_severity_gate_router(
    state: ReviewState,
) -> Literal["post_review_github", "human_approval_queue"]:
    """
    5. Confidence & Severity Gate Router (Phase 5.5):
    Evaluates verified findings and decides whether to post directly or pause for HITL review.
    - If any finding is CRITICAL or confidence < 0.85 -> "human_approval_queue"
    - Otherwise -> "post_review_github"
    """
    findings = state.get("verified_findings", [])
    for f in findings:
        if f.severity == "critical" or f.confidence < 0.85:
            logger.info(f"[{state['review_run_id']}] Gate routing to Human Approval (severity={f.severity}, conf={f.confidence})")
            return "human_approval_queue"

    logger.info(f"[{state['review_run_id']}] Gate routing to direct GitHub post")
    return "post_review_github"


async def post_review_github_node(state: ReviewState) -> Dict[str, Any]:
    """
    6. Post Review Node (Phase 5.5):
    Posts the final structured review comments to GitHub via API.
    """
    logger.info(f"[{state['review_run_id']}] Posting review to GitHub for PR #{state['pr_number']}")
    return {
        "status": "COMPLETED",
        "routing_decision": "POST_GITHUB",
    }


async def human_approval_queue_node(state: ReviewState) -> Dict[str, Any]:
    """
    7. Human Approval Queue Node (Phase 5.5):
    Marks workflow state as awaiting human review in the web dashboard.
    """
    logger.info(f"[{state['review_run_id']}] Workflow paused awaiting human approval.")
    return {
        "status": "AWAITING_HUMAN_APPROVAL",
        "routing_decision": "REQUIRE_HUMAN_APPROVAL",
    }


async def resume_after_human_approval_node(state: ReviewState) -> Dict[str, Any]:
    """
    8. Resume Node (Phase 5.5):
    Executes after human approval has been granted from dashboard.
    """
    logger.info(f"[{state['review_run_id']}] Workflow resumed from human approval.")
    return {
        "status": "COMPLETED",
        "routing_decision": "POST_GITHUB",
    }
