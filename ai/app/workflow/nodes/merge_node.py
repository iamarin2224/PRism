import logging
import time
from typing import Any, Dict, List
from app.models.review import Finding
from app.workflow.events import events_spine
from app.workflow.nodes.merge import deduplication_service
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.merge")


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
