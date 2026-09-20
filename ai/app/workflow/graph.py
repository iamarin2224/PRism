from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver
from typing import Optional

from app.workflow.state import ReviewState
from app.workflow.checkpointer import get_default_checkpointer
from app.workflow.nodes import (
    build_context_node,
    security_specialist_node,
    quality_specialist_node,
    tests_specialist_node,
    docs_specialist_node,
    aggregate_and_deduplicate_node,
    critic_verifier_node,
    confidence_severity_gate_router,
    post_review_github_node,
    human_approval_queue_node,
    resume_after_human_approval_node,
)


def create_review_graph(checkpointer: Optional[BaseCheckpointSaver] = None):
    """
    Constructs and compiles the production review StateGraph topology.
    
    Graph Topology:
    START ➔ build_context
          ├──► security_specialist ──┐
          ├──► quality_specialist  ──┼─► aggregate_and_deduplicate ➔ critic_verifier
          ├──► tests_specialist    ──┤                                     │
          └──► docs_specialist     ──┘                        (conditional gate)
                                                                ├──► post_review_github ➔ END
                                                                └──► human_approval_queue ➔ END
    """
    workflow = StateGraph(ReviewState)

    # 1. Register all execution nodes
    workflow.add_node("build_context", build_context_node)
    workflow.add_node("security_specialist", security_specialist_node)
    workflow.add_node("quality_specialist", quality_specialist_node)
    workflow.add_node("tests_specialist", tests_specialist_node)
    workflow.add_node("docs_specialist", docs_specialist_node)
    workflow.add_node("aggregate_and_deduplicate", aggregate_and_deduplicate_node)
    workflow.add_node("critic_verifier", critic_verifier_node)
    workflow.add_node("post_review_github", post_review_github_node)
    workflow.add_node("human_approval_queue", human_approval_queue_node)
    workflow.add_node("resume_after_human_approval", resume_after_human_approval_node)

    # 2. Add structural flow edges
    workflow.add_edge(START, "build_context")

    # Parallel specialist fan-out from build_context
    workflow.add_edge("build_context", "security_specialist")
    workflow.add_edge("build_context", "quality_specialist")
    workflow.add_edge("build_context", "tests_specialist")
    workflow.add_edge("build_context", "docs_specialist")

    # Fan-in synchronization to aggregate_and_deduplicate
    workflow.add_edge("security_specialist", "aggregate_and_deduplicate")
    workflow.add_edge("quality_specialist", "aggregate_and_deduplicate")
    workflow.add_edge("tests_specialist", "aggregate_and_deduplicate")
    workflow.add_edge("docs_specialist", "aggregate_and_deduplicate")

    # Flow to Critic verification
    workflow.add_edge("aggregate_and_deduplicate", "critic_verifier")

    # Conditional branching at the Confidence & Severity Gate
    workflow.add_conditional_edges(
        "critic_verifier",
        confidence_severity_gate_router,
        {
            "post_review_github": "post_review_github",
            "human_approval_queue": "human_approval_queue",
        },
    )

    workflow.add_edge("post_review_github", END)
    workflow.add_edge("human_approval_queue", END)
    workflow.add_edge("resume_after_human_approval", "post_review_github")

    # Compile with checkpointer for state preservation and HITL pausing
    saver = checkpointer if checkpointer is not None else get_default_checkpointer()
    return workflow.compile(checkpointer=saver)
