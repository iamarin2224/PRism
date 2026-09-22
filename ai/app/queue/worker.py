import logging
import uuid
from typing import Any, Dict
from arq.connections import RedisSettings

from app.config import settings
from app.rag.db import close_db_pool, init_db
from app.workflow.langgraph_engine import workflow_engine
from app.workflow.state import create_initial_review_state

logger = logging.getLogger("prism.queue.worker")


async def startup(ctx: Dict[str, Any]):
    """ARQ Worker startup lifecycle hook: initializes database pools."""
    logger.info("ARQ Worker initializing...")
    try:
        await init_db()
        ctx["workflow_engine"] = workflow_engine
        logger.info("ARQ Worker database and workflow engine initialized.")
    except Exception as e:
        logger.warning(f"ARQ Worker startup warning (e.g. DB unavailable): {e}")


async def shutdown(ctx: Dict[str, Any]):
    """ARQ Worker shutdown lifecycle hook: closes database pools."""
    logger.info("ARQ Worker shutting down...")
    try:
        await close_db_pool()
    except Exception as e:
        logger.warning(f"Error during ARQ Worker shutdown: {e}")


async def process_review_job(
    ctx: Dict[str, Any], payload: Dict[str, Any], delivery_id: str
) -> Dict[str, Any]:
    """
    ARQ task handler to process review workflow.
    Extracts PR details, initializes ReviewState, and invokes LangGraph WorkflowEngine.
    """
    repo = (
        payload.get("repository", {}).get("full_name")
        or payload.get("repository", {}).get("fullName")
        or "unknown"
    )
    pr_dict = payload.get("pull_request") or payload.get("pullRequest") or {}
    pr_num = pr_dict.get("number") or 0
    head_sha = pr_dict.get("head_sha") or pr_dict.get("headSha") or "head"
    base_sha = pr_dict.get("base_sha") or pr_dict.get("baseSha") or "main"

    review_run_id = f"run-{uuid.uuid4()}"
    logger.info(
        f"Processing review job '{review_run_id}' for repo={repo}, PR=#{pr_num}, delivery={delivery_id}"
    )

    initial_state = create_initial_review_state(
        review_run_id=review_run_id,
        repo_name=repo,
        pr_number=int(pr_num) if str(pr_num).isdigit() else 0,
        commit_sha=head_sha,
        base_sha=base_sha,
        pr_metadata=pr_dict,
    )

    engine = ctx.get("workflow_engine") or workflow_engine

    try:
        final_state = await engine.run(initial_state)
        status_result = final_state.get("status", "COMPLETED")
        routing_decision = final_state.get("routing_decision")
        findings_count = len(final_state.get("verified_findings", []))

        logger.info(
            f"Review job '{review_run_id}' completed with status={status_result}, "
            f"decision={routing_decision}, findings={findings_count}"
        )

        return {
            "status": "processed",
            "review_run_id": review_run_id,
            "workflow_status": status_result,
            "routing_decision": routing_decision,
            "repo": repo,
            "pr_number": pr_num,
            "delivery_id": delivery_id,
            "findings_count": findings_count,
        }
    except Exception as e:
        logger.error(f"Review workflow failed for run '{review_run_id}': {e}", exc_info=True)
        return {
            "status": "failed",
            "review_run_id": review_run_id,
            "error": str(e),
            "repo": repo,
            "pr_number": pr_num,
            "delivery_id": delivery_id,
        }


class WorkerSettings:
    """Configuration settings for running the ARQ background worker process."""
    functions = [process_review_job]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL or "redis://localhost:6379")
    max_jobs = 10
    job_timeout = 600  # 10 minutes
    on_startup = startup
    on_shutdown = shutdown
