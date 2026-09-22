import logging
import uuid
from typing import Any, Dict, List, Optional
from arq.connections import RedisSettings

from app.config import settings
from app.queue.enqueue import check_and_acquire_indexing_lock, release_indexing_lock
from app.rag.db import close_db_pool, get_db_pool, init_db
from app.rag.indexing.pipeline import indexing_pipeline
from app.workflow.langgraph_engine import workflow_engine
from app.workflow.state import create_initial_review_state

logger = logging.getLogger("prism.queue.worker")


def _map_specialist(name: Optional[str] = None) -> str:
    name_upper = (name or "QUALITY").upper()
    valid = {"SECURITY", "QUALITY", "TESTS", "DOCS", "CRITIC", "SYNTHESIS"}
    return name_upper if name_upper in valid else "QUALITY"


def _map_severity(sev: Optional[str] = None) -> str:
    sev_upper = (sev or "MEDIUM").upper()
    valid = {"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}
    return sev_upper if sev_upper in valid else "MEDIUM"


def _map_category(cat: Optional[str] = None) -> str:
    cat_upper = (cat or "BUG").upper()
    mapping = {
        "SECURITY": "SECURITY",
        "BUG": "BUG",
        "CORRECTNESS": "BUG",
        "ERROR_HANDLING": "BUG",
        "PERFORMANCE": "PERFORMANCE",
        "DESIGN": "DESIGN",
        "CODE_QUALITY": "DESIGN",
        "TEST_COVERAGE": "TEST_COVERAGE",
        "DOCUMENTATION": "DOCUMENTATION",
        "COMPLIANCE": "COMPLIANCE",
    }
    return mapping.get(cat_upper, "BUG")


def _map_review_status(status_str: Optional[str] = None) -> str:
    s_upper = (status_str or "QUEUED").upper()
    valid = {"QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED", "AWAITING_HUMAN_APPROVAL", "CANCELLED"}
    return s_upper if s_upper in valid else "COMPLETED"


def _map_routing_decision(decision: Optional[str] = None) -> Optional[str]:
    if not decision:
        return None
    d_upper = decision.upper()
    if d_upper in ("POST_REVIEW_GITHUB", "POST_GITHUB"):
        return "POST_GITHUB"
    if d_upper in ("HUMAN_APPROVAL_QUEUE", "REQUIRE_HUMAN_APPROVAL"):
        return "REQUIRE_HUMAN_APPROVAL"
    if d_upper in ("DISMISSED", "DISMISS"):
        return "DISMISSED"
    return "POST_GITHUB"


async def _persist_review_run(
    review_run_id: str,
    repo_name: str,
    pr_number: int,
    commit_sha: str,
    base_sha: str,
    status_str: str,
    routing_decision: Optional[str] = None,
    total_tokens_in: int = 0,
    total_tokens_out: int = 0,
    total_cost_usd: float = 0.0,
    duration_ms: Optional[float] = None,
    error_message: Optional[str] = None,
    findings: Optional[list] = None,
) -> None:
    """Helper to persist or update a ReviewRun record and its verified findings in PostgreSQL."""
    if not settings.DATABASE_URL:
        return

    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # 1. Look up repository ID if exists
            repo_row = await conn.fetchrow(
                "SELECT id FROM repositories WHERE full_name = $1;",
                repo_name,
            )
            repository_id = repo_row["id"] if repo_row else None

            db_status = _map_review_status(status_str)
            db_routing = _map_routing_decision(routing_decision)

            # 2. Upsert ReviewRun
            await conn.execute(
                """
                INSERT INTO review_runs (
                    id, repository_id, repo_name, pr_number, commit_sha, base_sha,
                    status, routing_decision, total_tokens_in, total_tokens_out,
                    total_cost_usd, duration_ms, error_message, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7::"ReviewStatus", $8::"RoutingDecision",
                    $9, $10, $11, $12, $13, NOW(), NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    status = $7::"ReviewStatus",
                    routing_decision = $8::"RoutingDecision",
                    total_tokens_in = $9,
                    total_tokens_out = $10,
                    total_cost_usd = $11,
                    duration_ms = $12,
                    error_message = $13,
                    updated_at = NOW();
                """,
                review_run_id,
                repository_id,
                repo_name,
                pr_number,
                commit_sha,
                base_sha,
                db_status,
                db_routing,
                total_tokens_in,
                total_tokens_out,
                total_cost_usd,
                duration_ms,
                error_message,
            )

            # 3. Insert findings if present
            if findings:
                for f in findings:
                    f_id = getattr(f, "id", None) or str(uuid.uuid4())
                    spec = _map_specialist(getattr(f, "specialist", None))
                    cat = _map_category(getattr(f, "category", None))
                    sev = _map_severity(getattr(f, "severity", None))
                    f_path = getattr(f, "file_path", "") or ""
                    start_l = getattr(f, "start_line", None) or getattr(f, "line", 1) or 1
                    end_l = getattr(f, "end_line", None) or start_l
                    title = getattr(f, "title", "Issue")
                    desc = getattr(f, "description", "")
                    sugg = getattr(f, "suggestion", None)
                    conf = float(getattr(f, "confidence", 1.0))
                    agree = int(getattr(f, "agreement_count", 1))
                    is_ver = bool(getattr(f, "is_verified", True))

                    await conn.execute(
                        """
                        INSERT INTO review_findings (
                            id, review_run_id, specialist, category, severity,
                            file_path, start_line, end_line, title, description,
                            suggestion, confidence, agreement_count, is_verified, created_at
                        ) VALUES (
                            $1, $2, $3::"SpecialistType", $4::"FindingCategory", $5::"FindingSeverity",
                            $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
                        )
                        ON CONFLICT (id) DO NOTHING;
                        """,
                        f_id,
                        review_run_id,
                        spec,
                        cat,
                        sev,
                        f_path,
                        start_l,
                        end_l,
                        title,
                        desc,
                        sugg,
                        conf,
                        agree,
                        is_ver,
                    )
    except Exception as e:
        logger.warning(f"Failed to persist ReviewRun / findings in PostgreSQL: {e}")


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
    Extracts PR details, initializes ReviewState, invokes LangGraph, and persists ReviewRun & findings.
    """
    import time
    start_time = time.perf_counter()

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

    # Initial record insertion
    await _persist_review_run(
        review_run_id=review_run_id,
        repo_name=repo,
        pr_number=int(pr_num) if str(pr_num).isdigit() else 0,
        commit_sha=head_sha,
        base_sha=base_sha,
        status_str="IN_PROGRESS",
    )

    engine = ctx.get("workflow_engine") or workflow_engine

    try:
        final_state = await engine.run(initial_state)
        status_result = final_state.get("status", "COMPLETED")
        routing_decision = final_state.get("routing_decision")
        findings = final_state.get("verified_findings", [])
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Update ReviewRun with finalized state and findings
        await _persist_review_run(
            review_run_id=review_run_id,
            repo_name=repo,
            pr_number=int(pr_num) if str(pr_num).isdigit() else 0,
            commit_sha=head_sha,
            base_sha=base_sha,
            status_str=status_result,
            routing_decision=routing_decision,
            total_tokens_in=final_state.get("total_tokens_in", 0),
            total_tokens_out=final_state.get("total_tokens_out", 0),
            total_cost_usd=final_state.get("total_cost_inr", 0.0),
            duration_ms=duration_ms,
            findings=findings,
        )

        logger.info(
            f"Review job '{review_run_id}' completed with status={status_result}, "
            f"decision={routing_decision}, findings={len(findings)}"
        )

        return {
            "status": "processed",
            "review_run_id": review_run_id,
            "workflow_status": status_result,
            "routing_decision": routing_decision,
            "repo": repo,
            "pr_number": pr_num,
            "delivery_id": delivery_id,
            "findings_count": len(findings),
        }
    except Exception as e:
        logger.error(f"Review workflow failed for run '{review_run_id}': {e}", exc_info=True)
        duration_ms = (time.perf_counter() - start_time) * 1000
        await _persist_review_run(
            review_run_id=review_run_id,
            repo_name=repo,
            pr_number=int(pr_num) if str(pr_num).isdigit() else 0,
            commit_sha=head_sha,
            base_sha=base_sha,
            status_str="FAILED",
            duration_ms=duration_ms,
            error_message=str(e),
        )
        return {
            "status": "failed",
            "review_run_id": review_run_id,
            "error": str(e),
            "repo": repo,
            "pr_number": pr_num,
            "delivery_id": delivery_id,
        }


async def process_indexing_job(
    ctx: Dict[str, Any], payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    ARQ task handler to process full and incremental repository indexing asynchronously.
    Enforces Redis locking to prevent concurrent overlapping jobs on the same repo.
    """
    repo_name = payload.get("repo_name", "unknown")
    commit_sha = payload.get("commit_sha", "main")
    force_full = payload.get("force_full", False)
    github_token = payload.get("github_token")
    raw_files = payload.get("raw_files")
    changed_files_map = payload.get("changed_files_map")
    installation_id = payload.get("installation_id")

    logger.info(f"ARQ Worker starting indexing job for {repo_name} at commit {commit_sha} (force_full={force_full})")

    # Enforce atomic Redis concurrency lock
    lock_acquired = await check_and_acquire_indexing_lock(repo_name)
    if not lock_acquired:
        logger.warning(f"Indexing job for {repo_name} skipped: repository indexing lock already held.")
        return {
            "status": "skipped",
            "repo_name": repo_name,
            "reason": "lock_held",
        }

    try:
        await indexing_pipeline.execute_indexing(
            repo_name=repo_name,
            target_commit=commit_sha,
            force_full=force_full,
            github_token=github_token,
            raw_files=raw_files,
            changed_files_map=changed_files_map,
            installation_id=installation_id,
        )
        logger.info(f"ARQ Worker completed indexing job for {repo_name}")
        return {
            "status": "completed",
            "repo_name": repo_name,
            "commit_sha": commit_sha,
        }
    except Exception as e:
        logger.error(f"ARQ Worker indexing failed for {repo_name}: {e}", exc_info=True)
        return {
            "status": "failed",
            "repo_name": repo_name,
            "error": str(e),
        }
    finally:
        await release_indexing_lock(repo_name)


class WorkerSettings:
    """Configuration settings for running the ARQ background worker process."""
    functions = [process_review_job, process_indexing_job]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL or "redis://localhost:6379")
    max_jobs = 10
    job_timeout = 600  # 10 minutes
    on_startup = startup
    on_shutdown = shutdown
