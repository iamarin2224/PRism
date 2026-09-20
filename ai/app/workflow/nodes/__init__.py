import logging
import time
from typing import Any, Dict, List, Literal

from app.models.review import Finding
from app.rag import code_retriever
from app.workflow.agents import (
    docs_agent,
    quality_agent,
    security_agent,
    tests_agent,
)
from app.workflow.events import cost_calculator, events_spine
from app.workflow.memory import (
    episodic_memory_service,
    load_procedural_rules,
)
from app.workflow.nodes.critic import critic_verifier_service
from app.workflow.nodes.merge import deduplication_service
from app.workflow.nodes.post import github_review_poster
from app.workflow.state import ReviewState, SpecialistOutput

logger = logging.getLogger("prism.workflow.nodes")


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


async def security_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.1 Security Specialist Agent Node:
    Analyzes OWASP vulnerabilities, auth flaws, secrets, and injection risks.
    """
    logger.info(f"[{state['review_run_id']}] Security specialist executing...")
    output = await security_agent.execute(state)

    cost_usd = cost_calculator.calculate_cost_usd(
        model_name="deepseek/deepseek-v4.1-flash",
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_security",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_usd=cost_usd,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def quality_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.2 Quality Specialist Agent Node:
    Analyzes code design, anti-patterns, performance, and maintainability.
    """
    logger.info(f"[{state['review_run_id']}] Quality specialist executing...")
    output = await quality_agent.execute(state)

    cost_usd = cost_calculator.calculate_cost_usd(
        model_name="qwen/qwen3-coder-30b-a3b-instruct",
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_quality",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_usd=cost_usd,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def tests_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.3 Tests Specialist Agent Node:
    Analyzes regression risk, test coverage, and sandbox verification.
    """
    logger.info(f"[{state['review_run_id']}] Tests specialist executing...")
    output = await tests_agent.execute(state)

    cost_usd = cost_calculator.calculate_cost_usd(
        model_name="qwen/qwen3-coder-30b-a3b-instruct",
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_tests",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_usd=cost_usd,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def docs_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    2.4 Documentation Specialist Agent Node:
    Analyzes API contracts, comments, breaking changes, and documentation completeness.
    """
    logger.info(f"[{state['review_run_id']}] Docs specialist executing...")
    output = await docs_agent.execute(state)

    cost_usd = cost_calculator.calculate_cost_usd(
        model_name="openrouter/free",
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_docs",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_usd=cost_usd,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def aggregate_and_deduplicate_node(state: ReviewState) -> Dict[str, Any]:
    """
    3. Aggregation & Deduplication Node:
    Pure-Python deterministic merge matching findings by file path and overlapping
    line ranges, tracking cross-specialist agreement.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Aggregating findings from specialists...")
    all_findings: List[Finding] = []
    for res in state.get("specialist_results", []):
        all_findings.extend(res.findings)

    merged = deduplication_service.deduplicate(all_findings)
    duration_ms = (time.perf_counter() - start_time) * 1000

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="aggregate_merge",
        event_type="FINDINGS_MERGED",
        payload={
            "raw_findings_count": len(all_findings),
            "merged_findings_count": len(merged),
        },
        duration_ms=duration_ms,
    )

    return {"merged_findings": merged}


async def critic_verifier_node(state: ReviewState) -> Dict[str, Any]:
    """
    4. Critic / Verifier Node:
    Validates candidate findings against retrieved code context to eliminate
    hallucinations and false positives.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Critic verifying findings...")
    candidates = state.get("merged_findings", [])
    verified = await critic_verifier_service.verify_findings(candidates, state)
    duration_ms = (time.perf_counter() - start_time) * 1000

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="critic_verifier",
        event_type="CRITIC_VERIFIED",
        payload={
            "candidates_count": len(candidates),
            "verified_count": len(verified),
        },
        duration_ms=duration_ms,
    )

    return {"verified_findings": verified}


def confidence_severity_gate_router(
    state: ReviewState,
) -> Literal["post_review_github", "human_approval_queue"]:
    """
    5. Confidence & Severity Gate Router:
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
    6. Post Review Node:
    Posts the final structured review comments to GitHub via API.
    """
    start_time = time.perf_counter()
    logger.info(f"[{state['review_run_id']}] Posting review to GitHub for PR #{state['pr_number']}")
    result = await github_review_poster.post_review(state)
    duration_ms = (time.perf_counter() - start_time) * 1000

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="post_review_github",
        event_type="REVIEW_POSTED",
        payload={"pr_number": state["pr_number"], "repo_name": state["repo_name"]},
        duration_ms=duration_ms,
    )

    return result


async def human_approval_queue_node(state: ReviewState) -> Dict[str, Any]:
    """
    7. Human Approval Queue Node:
    Marks workflow state as awaiting human review in the web dashboard.
    """
    logger.info(f"[{state['review_run_id']}] Workflow paused awaiting human approval.")
    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="human_approval_queue",
        event_type="AWAITING_HUMAN_APPROVAL",
        payload={"findings_count": len(state.get("verified_findings", []))},
    )

    return {
        "status": "AWAITING_HUMAN_APPROVAL",
        "routing_decision": "REQUIRE_HUMAN_APPROVAL",
    }


async def resume_after_human_approval_node(state: ReviewState) -> Dict[str, Any]:
    """
    8. Resume Node:
    Executes after human approval has been granted from dashboard.
    """
    logger.info(f"[{state['review_run_id']}] Workflow resumed from human approval.")
    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="resume_after_human_approval",
        event_type="RESUMED_AFTER_APPROVAL",
        payload={"pr_number": state["pr_number"]},
    )

    return {
        "status": "COMPLETED",
        "routing_decision": "POST_GITHUB",
    }
