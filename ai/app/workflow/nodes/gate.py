import logging
import time
from typing import Any, Dict, Literal
from app.workflow.events import events_spine
from app.workflow.nodes.critic import critic_verifier_service
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.gate")


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
