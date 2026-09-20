import logging
from typing import Any, Dict
from arq.connections import RedisSettings
from app.config import settings

logger = logging.getLogger("prism.queue.worker")


async def startup(ctx: Dict[str, Any]):
    """ARQ Worker startup lifecycle hook."""
    logger.info("ARQ Worker initializing...")


async def shutdown(ctx: Dict[str, Any]):
    """ARQ Worker shutdown lifecycle hook."""
    logger.info("ARQ Worker shutting down...")


async def process_review_job(
    ctx: Dict[str, Any], payload: Dict[str, Any], delivery_id: str
) -> Dict[str, Any]:
    """
    ARQ task handler to process review workflow.
    In Phase 5.2+, this invokes the LangGraph WorkflowEngine.
    """
    repo = payload.get("repository", {}).get("full_name") or payload.get("repository", {}).get("fullName") or "unknown"
    pr_num = payload.get("pull_request", {}).get("number") or payload.get("pullRequest", {}).get("number") or "unknown"
    logger.info(f"Processing review job for repo={repo}, PR=#{pr_num}, delivery={delivery_id}")

    # Return structured execution receipt
    return {
        "status": "processed",
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
