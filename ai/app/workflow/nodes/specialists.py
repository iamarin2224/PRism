import logging
from typing import Any, Dict
from app.config import settings
from app.workflow.agents import (
    docs_agent,
    quality_agent,
    security_agent,
    summary_agent,
    tests_agent,
)
from app.workflow.events import cost_calculator, events_spine
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.nodes.specialists")


async def pr_summary_node(state: ReviewState) -> Dict[str, Any]:
    """
    PR Summary Agent Node:
    Synthesizes overall PR intent, file change breakdown, and architectural impact using Mid model.
    """
    logger.info(f"[{state['review_run_id']}] PR summary agent executing...")
    summary_data = await summary_agent.generate_pr_summary(state)
    tokens_in = summary_data.get("_tokens_in", 0)
    tokens_out = summary_data.get("_tokens_out", 0)
    duration_ms = summary_data.get("_duration_ms", 0.0)

    cost_inr = cost_calculator.calculate_cost_inr(
        model_name=settings.MID_MODEL,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )

    clean_summary = {k: v for k, v in summary_data.items() if not k.startswith("_")}

    await events_spine.emit_event(
        review_run_id=state["review_run_id"],
        node_name="agent_summary",
        event_type="PR_SUMMARY_GENERATED",
        payload=clean_summary,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_inr=cost_inr,
        duration_ms=duration_ms,
    )

    return {"pr_summary": clean_summary}


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
        payload={
            "findings_count": len(output.findings),
            "verdict_summary": output.verdict_summary,
            "error": output.error,
        },
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
        payload={
            "findings_count": len(output.findings),
            "verdict_summary": output.verdict_summary,
            "error": output.error,
        },
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
        payload={
            "findings_count": len(output.findings),
            "verdict_summary": output.verdict_summary,
            "error": output.error,
        },
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
        payload={
            "findings_count": len(output.findings),
            "verdict_summary": output.verdict_summary,
            "error": output.error,
        },
        tokens_in=output.tokens_in,
        tokens_out=output.tokens_out,
        cost_inr=cost_inr,
        duration_ms=output.execution_time_ms,
    )

    return {"specialist_results": [output]}
