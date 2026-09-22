import logging
from typing import Any, Dict
from app.config import settings
from app.workflow.agents import (
    docs_agent,
    quality_agent,
    security_agent,
    tests_agent,
)
from app.workflow.events import cost_calculator, events_spine
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.specialists")


async def security_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    Security Specialist Agent Node:
    Analyzes OWASP vulnerabilities, auth flaws, secrets, and injection risks.
    """
    logger.info(f"[{state['review_run_id']}] Security specialist executing...")
    output = await security_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name=settings.HIGH_MODEL,
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_security",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_inr=cost_inr,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def quality_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    Quality Specialist Agent Node:
    Analyzes code design, anti-patterns, performance, and maintainability.
    """
    logger.info(f"[{state['review_run_id']}] Quality specialist executing...")
    output = await quality_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name=settings.MID_MODEL,
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_quality",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_inr=cost_inr,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def tests_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    Tests Specialist Agent Node:
    Analyzes regression risk, test coverage, and sandbox verification.
    """
    logger.info(f"[{state['review_run_id']}] Tests specialist executing...")
    output = await tests_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name=settings.MID_MODEL,
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_tests",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_inr=cost_inr,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}


async def docs_specialist_node(state: ReviewState) -> Dict[str, Any]:
    """
    Documentation Specialist Agent Node:
    Analyzes API contracts, comments, breaking changes, and documentation completeness.
    """
    logger.info(f"[{state['review_run_id']}] Docs specialist executing...")
    output = await docs_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name=settings.OPENROUTER_MODEL,
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
    )


    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="specialist_docs",
        event_type="SPECIALIST_COMPLETED",
        payload={"findings_count": len(output.findings), "error": output.error},
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_inr=cost_inr,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}
