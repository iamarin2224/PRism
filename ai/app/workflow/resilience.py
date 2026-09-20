import asyncio
import functools
import logging
import time
from typing import Any, Callable, TypeVar

logger = logging.getLogger("prism.workflow.resilience")

T = TypeVar("T")


class CircuitBreakerOpenException(Exception):
    """Raised when an operation is attempted while the circuit breaker is OPEN."""
    pass


class CircuitBreaker:
    """
    Circuit breaker pattern to protect downstream LLM and database endpoints
    from cascading failures under high error rates.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout_sec: float = 30.0,
        name: str = "default",
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec
        self.name = name
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN

    def record_success(self):
        self.failure_count = 0
        self.state = "CLOSED"

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            logger.error(f"CircuitBreaker '{self.name}' tripped to OPEN state after {self.failure_count} failures.")

    def can_execute(self) -> bool:
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            if time.time() - self.last_failure_time > self.recovery_timeout_sec:
                self.state = "HALF_OPEN"
                logger.info(f"CircuitBreaker '{self.name}' transitioned to HALF_OPEN state.")
                return True
            return False
        if self.state == "HALF_OPEN":
            return True
        return True


def with_retry(
    max_retries: int = 3,
    base_delay: float = 0.5,
    backoff_factor: float = 2.0,
    circuit_breaker: CircuitBreaker | None = None,
):
    """
    Decorator that provides async exponential backoff retry and circuit breaker protection.
    """
    def decorator(func: Callable[..., Any]):
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any):
            if circuit_breaker and not circuit_breaker.can_execute():
                raise CircuitBreakerOpenException(f"Circuit breaker '{circuit_breaker.name}' is OPEN.")

            delay = base_delay
            last_err = None

            for attempt in range(1, max_retries + 1):
                try:
                    result = await func(*args, **kwargs)
                    if circuit_breaker:
                        circuit_breaker.record_success()
                    return result
                except Exception as e:
                    last_err = e
                    if circuit_breaker:
                        circuit_breaker.record_failure()

                    if attempt == max_retries:
                        logger.warning(f"Function '{func.__name__}' failed after {attempt}/{max_retries} attempts: {e}")
                        break

                    logger.debug(f"Retrying '{func.__name__}' in {delay:.2f}s (attempt {attempt}/{max_retries}) due to: {e}")
                    await asyncio.sleep(delay)
                    delay *= backoff_factor

            raise last_err  # type: ignore[misc]

        return wrapper
    return decorator
