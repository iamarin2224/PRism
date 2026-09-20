import logging
import time
from typing import Any, Dict
from app.workflow.events import events_spine
from app.workflow.nodes.post import github_review_poster
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.actions")


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
