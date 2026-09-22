import logging
import uuid
from typing import Optional
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import settings
from app.models.github import PREventPayload
from app.queue.redis import get_redis_client

logger = logging.getLogger("prism.queue.enqueue")

IDEMPOTENCY_PREFIX = "idempotency:github_delivery:"
DEFAULT_IDEMPOTENCY_TTL = 86400  # 24 hours in seconds


async def check_and_set_delivery_idempotency(
    delivery_id: str, ttl_seconds: int = DEFAULT_IDEMPOTENCY_TTL
) -> bool:
    """
    Atomically verify and set GitHub delivery idempotency key in Redis using SET ... NX EX.
    
    :param delivery_id: Unique X-GitHub-Delivery header value.
    :param ttl_seconds: Expiration TTL (default 24h).
    :return: True if this is the first delivery and key was acquired; False if duplicate.
    """
    if not delivery_id or not delivery_id.strip():
        # If no delivery_id provided, generate a fallback unique ID
        return True

    clean_id = delivery_id.strip()
    key = f"{IDEMPOTENCY_PREFIX}{clean_id}"

    try:
        redis_client = await get_redis_client()
        # SET key 1 NX EX ttl returns True if set, None/False if already exists
        is_new = await redis_client.set(key, "1", nx=True, ex=ttl_seconds)
        return bool(is_new)
    except Exception as e:
        logger.warning(f"Redis idempotency check failed: {e}. Allowing delivery to proceed.")
        return True


async def enqueue_review_job(
    event: PREventPayload, delivery_id: Optional[str] = None
) -> str:
    """
    Dispatch a pull request review job to the ARQ Redis background queue.
    
    :param event: Validated PREventPayload from GitHub webhook.
    :param delivery_id: Optional GitHub delivery GUID.
    :return: Generated job_id string.
    """
    job_id = f"review-{uuid.uuid4()}"
    payload_dict = event.model_dump()
    clean_delivery_id = delivery_id.strip() if delivery_id else job_id

    try:
        redis_settings = RedisSettings.from_dsn(settings.REDIS_URL or "redis://localhost:6379")
        arq_pool: ArqRedis = await create_pool(redis_settings)
        await arq_pool.enqueue_job(
            "process_review_job",
            payload_dict,
            clean_delivery_id,
            _job_id=job_id,
        )
        logger.info(f"Enqueued review job '{job_id}' for delivery '{clean_delivery_id}'")
        return job_id
    except Exception as e:
        logger.warning(f"Failed to enqueue to ARQ pool ({e}). Returning local job id '{job_id}'.")
        return job_id


INDEXING_LOCK_PREFIX = "indexing:lock:"
DEFAULT_INDEXING_LOCK_TTL = 600  # 10 minutes


async def check_and_acquire_indexing_lock(repo_name: str, ttl_seconds: int = DEFAULT_INDEXING_LOCK_TTL) -> bool:
    """Atomically acquires a Redis lock for repository indexing to prevent duplicate runs."""
    key = f"{INDEXING_LOCK_PREFIX}{repo_name}"
    try:
        redis_client = await get_redis_client()
        is_acquired = await redis_client.set(key, "1", nx=True, ex=ttl_seconds)
        return bool(is_acquired)
    except Exception as e:
        logger.warning(f"Redis indexing lock check failed: {e}. Allowing job to proceed.")
        return True


async def release_indexing_lock(repo_name: str) -> None:
    """Releases the repository indexing Redis lock."""
    key = f"{INDEXING_LOCK_PREFIX}{repo_name}"
    try:
        redis_client = await get_redis_client()
        await redis_client.delete(key)
    except Exception as e:
        logger.warning(f"Failed to release Redis indexing lock for {repo_name}: {e}")


async def enqueue_indexing_job(
    repo_name: str,
    commit_sha: Optional[str] = None,
    force_full: bool = False,
    github_token: Optional[str] = None,
    raw_files: Optional[list] = None,
    changed_files_map: Optional[dict] = None,
    installation_id: Optional[int] = None,
) -> str:
    """
    Dispatch an asynchronous repository indexing job to the ARQ Redis background queue.
    """
    job_id = f"index-{uuid.uuid4()}"
    payload = {
        "repo_name": repo_name,
        "commit_sha": commit_sha or "main",
        "force_full": force_full,
        "github_token": github_token,
        "raw_files": raw_files,
        "changed_files_map": changed_files_map,
        "installation_id": installation_id,
    }

    try:
        redis_settings = RedisSettings.from_dsn(settings.REDIS_URL or "redis://localhost:6379")
        arq_pool: ArqRedis = await create_pool(redis_settings)
        await arq_pool.enqueue_job(
            "process_indexing_job",
            payload,
            _job_id=job_id,
        )
        logger.info(f"Enqueued indexing job '{job_id}' for repo '{repo_name}' at commit '{commit_sha or 'main'}'")
        return job_id
    except Exception as e:
        logger.warning(f"Failed to enqueue indexing job to ARQ pool ({e}). Returning local job id '{job_id}'.")
        return job_id

