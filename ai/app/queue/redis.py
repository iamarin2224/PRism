import logging
from typing import Optional
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger("prism.queue.redis")

_redis_pool: Optional[aioredis.Redis] = None


async def get_redis_client() -> aioredis.Redis:
    """Returns an async Redis client with persistent connection pooling."""
    global _redis_pool
    if _redis_pool is None:
        redis_url = settings.REDIS_URL or "redis://localhost:6379"
        _redis_pool = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
    return _redis_pool


async def close_redis():
    """Cleanly closes the async Redis connection pool on application shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        try:
            await _redis_pool.aclose()
        except Exception as e:
            logger.warning(f"Error closing Redis connection pool: {e}")
        finally:
            _redis_pool = None
