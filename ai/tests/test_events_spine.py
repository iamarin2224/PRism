import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.config import settings
from app.workflow.events import cost_calculator, events_spine
from app.workflow.resilience import CircuitBreaker, CircuitBreakerOpenException, with_retry


def test_cost_calculator():
    # DeepSeek High Model (₹15.10 / 1M in, ₹60.40 / 1M out)
    cost_ds = cost_calculator.calculate_cost_inr(
        model_name="deepseek/deepseek-v4.1-flash",
        tokens_in=10_000,
        tokens_out=2_000,
    )
    # (10,000 / 1,000,000)*15.10 + (2,000 / 1,000,000)*60.40 = 0.151 + 0.1208 = 0.2718
    assert cost_ds == 0.2718

    # Qwen Mid Model (₹7.05 / 1M in, ₹27.18 / 1M out)
    cost_qwen = cost_calculator.calculate_cost_inr(
        model_name="qwen/qwen3-coder-30b-a3b-instruct",
        tokens_in=10_000,
        tokens_out=2_000,
    )
    # (10,000 / 1,000,000)*7.05 + (2,000 / 1,000,000)*27.18 = 0.0705 + 0.05436 = 0.12486
    assert cost_qwen == 0.12486

    # OpenRouter free model
    cost_free = cost_calculator.calculate_cost_inr(
        model_name="openrouter/free",
        tokens_in=50_000,
        tokens_out=10_000,
    )
    assert cost_free == 0.0


def test_events_spine_emit_event_mocked():
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock(return_value="INSERT 0 1")

    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch.object(settings, "DATABASE_URL", "postgresql://fake:fake@localhost/testdb"), \
         patch("app.workflow.events.spine.get_db_pool", AsyncMock(return_value=mock_pool)):
        event_id = asyncio.run(
            events_spine.emit_event(
                review_run_id="run-spine-test",
                node_name="specialist_security",
                event_type="SPECIALIST_COMPLETED",
                payload={"findings": 2},
                tokens_in=500,
                tokens_out=100,
                cost_inr=0.0005,
                duration_ms=45.2,
            )
        )
        assert event_id is not None
        assert mock_conn.execute.called


def test_circuit_breaker_and_retry():
    cb = CircuitBreaker(failure_threshold=2, recovery_timeout_sec=0.1, name="test_breaker")
    attempts = 0

    @with_retry(max_retries=2, base_delay=0.01, circuit_breaker=cb)
    async def flaky_call():
        nonlocal attempts
        attempts += 1
        raise ValueError("Simulated network timeout")

    with pytest.raises(ValueError):
        asyncio.run(flaky_call())

    assert attempts == 2
    assert cb.state == "OPEN"
    assert not cb.can_execute()

    # Attempting to call while OPEN immediately throws CircuitBreakerOpenException without invoking function
    with pytest.raises(CircuitBreakerOpenException):
        asyncio.run(flaky_call())
