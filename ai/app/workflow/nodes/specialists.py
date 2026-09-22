import logging
from typing import Any, Dict
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
    2.1 Security Specialist Agent Node:
    Analyzes OWASP vulnerabilities, auth flaws, secrets, and injection risks.
    """
    logger.info(f"[{state['review_run_id']}] Security specialist executing...")
    output = await security_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name="deepseek/deepseek-v4.1-flash",
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
    2.2 Quality Specialist Agent Node:
    Analyzes code design, anti-patterns, performance, and maintainability.
    """
    logger.info(f"[{state['review_run_id']}] Quality specialist executing...")
    output = await quality_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name="qwen/qwen3-coder-30b-a3b-instruct",
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
    2.3 Tests Specialist Agent Node:
    Analyzes regression risk, test coverage, and sandbox verification.
    """
    logger.info(f"[{state['review_run_id']}] Tests specialist executing...")
    output = await tests_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name="qwen/qwen3-coder-30b-a3b-instruct",
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
    2.4 Documentation Specialist Agent Node:
    Analyzes API contracts, comments, breaking changes, and documentation completeness.
    """
    logger.info(f"[{state['review_run_id']}] Docs specialist executing...")
    output = await docs_agent.execute(state)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name="openrouter/free",
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
